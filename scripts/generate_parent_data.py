"""
Generate student progress and family authentication data for the Parent Portal.

Reads from SQL Server and writes to Firestore:
  • student_progress/{studentNumber}  – per-student multi-year academic history
  • families/{familyNumber}           – family credentials + children list

Usage:
    python generate_parent_data.py          # generate all
    python generate_parent_data.py 25-26    # regenerate for a specific year only
"""

import os
import sys
import json
import hashlib
from datetime import datetime
from decimal import Decimal
from collections import defaultdict

try:
    import pyodbc
except ImportError:
    sys.exit("pyodbc required: pip install pyodbc")

try:
    import bcrypt as _bcrypt
except ImportError:
    sys.exit("bcrypt required: pip install bcrypt")

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    sys.exit("firebase-admin required: pip install firebase-admin")


def hash_pw(plain: str) -> str:
    """Hash a password with bcrypt."""
    return _bcrypt.hashpw(plain.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")

SERVER = r"localhost\SQLEXPRESS"
TEMP_DB = "_bak_import_temp"
KEY_PATH = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")

BATCH_SIZE = 100  # Proven batch size for large student documents


def safe(val):
    """Make a value JSON/Firestore-safe."""
    if val is None:
        return None
    if isinstance(val, Decimal):
        return float(val)
    if isinstance(val, datetime):
        return val.isoformat()
    if isinstance(val, bytes):
        return None
    return val


def get_class_name_map(cursor):
    cursor.execute("SELECT Class_Code, E_Class_Desc FROM Class")
    return {str(r.Class_Code): str(r.E_Class_Desc or r.Class_Code) for r in cursor.fetchall()}


def get_section_name_map(cursor):
    """Return two section name maps:
    - specific: (year, major, class, section) → name  (school-specific, correct)
    - generic:  section_code → name  (fallback, may be wrong for multi-school setups)
    """
    cursor.execute("""
        SELECT Academic_Year, Major_Code, Class_Code, Section_Code, E_Section_Name
        FROM Section
    """)
    specific = {}   # (year, major, class, section) → name
    generic = {}    # section_code → name (fallback)
    for r in cursor.fetchall():
        yr = str(r.Academic_Year).strip()
        major = str(r.Major_Code).strip()
        cc = str(r.Class_Code).strip()
        sc = str(r.Section_Code).strip()
        name = str(r.E_Section_Name or sc).strip()
        specific[(yr, major, cc, sc)] = name
        generic[sc] = name
    return specific, generic


def build_student_progress(cursor, class_map, section_map, target_year=None):
    """
    Build per-student progress documents from the Grades table.
    Returns a dict: { studentNumber: document_dict }
    """
    print("\n── Building student progress documents ──")

    # 1. Get student → family mapping
    print("  Loading student → family mapping...")
    cursor.execute("""
        SELECT Student_Number, Family_Number, Child_Number
        FROM Student
        WHERE Family_Number IS NOT NULL
    """)
    student_family = {}
    for r in cursor.fetchall():
        student_family[str(r.Student_Number).strip()] = {
            "family_number": str(r.Family_Number).strip(),
            "child_number": safe(r.Child_Number),
        }
    print(f"    {len(student_family)} students with family links")

    # 2. Get child names from Family_Children + Family (for full name)
    #    Also load transcript-related fields: Arabic name, DOB, birth place, nationality
    print("  Loading child names + transcript info...")
    cursor.execute("""
        SELECT fc.Family_Number, fc.Child_Number,
               fc.E_Child_Name, fc.A_Child_Name, fc.Gender,
               fc.Child_Birth_Date, fc.E_Child_Birth_Place, fc.A_Child_Birth_Place,
               fc.Nationality_Code_Primary,
               f.E_Family_Name, f.A_Family_Name,
               f.E_Father_Name, f.A_Father_Name,
               f.E_Grand_Father, f.A_Grand_Father,
               fc.Family_Sub
        FROM Family_Children fc
        LEFT JOIN Family f ON fc.Family_Number = f.Family_Number
    """)
    child_names = {}
    for r in cursor.fetchall():
        key = (str(r.Family_Number).strip(), safe(r.Child_Number))
        first = str(r.E_Child_Name or "").strip()
        father = str(r.E_Father_Name or "").strip()
        grandfather = str(r.E_Grand_Father or "").strip()
        last = str(r.E_Family_Name or "").strip()
        # Full name: Child Father [Grandfather] Family
        parts = [p for p in [first, father, grandfather, last] if p]
        full_name = " ".join(parts)
        first_ar = str(r.A_Child_Name or "").strip()
        father_ar = str(r.A_Father_Name or "").strip()
        grandfather_ar = str(r.A_Grand_Father or "").strip()
        last_ar = str(r.A_Family_Name or "").strip()
        parts_ar = [p for p in [first_ar, father_ar, grandfather_ar, last_ar] if p]
        full_name_ar = " ".join(parts_ar)
        child_names[key] = {
            "name": full_name,
            "name_ar": full_name_ar,
            "gender": "Male" if r.Gender else "Female",
            "dob": safe(r.Child_Birth_Date),
            "birth_place_en": str(r.E_Child_Birth_Place or "").strip(),
            "birth_place_ar": str(r.A_Child_Birth_Place or "").strip(),
            "nationality_code": str(r.Nationality_Code_Primary or "").strip(),
        }
    print(f"    {len(child_names)} child records")

    # 2b. Load nationality lookup
    print("  Loading nationalities...")
    cursor.execute("SELECT Nationality_Code, E_Nationality_Name, A_Nationality_Name FROM Nationality")
    nationality_map = {}
    for r in cursor.fetchall():
        code = str(r.Nationality_Code).strip()
        nationality_map[code] = {
            "en": str(r.E_Nationality_Name or "").strip(),
            "ar": str(r.A_Nationality_Name or "").strip(),
        }
    print(f"    {len(nationality_map)} nationalities")

    # 2c. Load enrollment dates from Student table
    print("  Loading enrollment dates...")
    cursor.execute("SELECT Student_Number, Enrollment_Date FROM Student")
    enrollment_dates = {}
    for r in cursor.fetchall():
        sn = str(r.Student_Number).strip()
        enrollment_dates[sn] = safe(r.Enrollment_Date)
    print(f"    {len(enrollment_dates)} enrollment records")

    # 2d. Load previous school data
    print("  Loading previous schools...")
    cursor.execute("""
        SELECT Student_Number, Academic_Year,
               COALESCE(E_Local_School_Name, E_Foreign_School_Name, '') AS prev_school_en,
               COALESCE(A_Local_School_Name, A_Foreign_School_Name, '') AS prev_school_ar
        FROM vwStudentPreviousSchools
    """)
    prev_school_map = {}
    for r in cursor.fetchall():
        sn = str(r.Student_Number).strip()
        prev_school_map[sn] = {
            "en": str(r.prev_school_en or "").strip(),
            "ar": str(r.prev_school_ar or "").strip(),
            "year": str(r.Academic_Year or "").strip(),
        }
    print(f"    {len(prev_school_map)} previous school records")

    # 2e. Load iqama numbers from tbOtherIds (Source='C', Code IN 02,03)
    print("  Loading iqama numbers from tbOtherIds...")
    cursor.execute("""
        SELECT Source_Number, OtherId_Value
        FROM tbOtherIds
        WHERE OtherId_Source = 'C'
          AND OtherId_Code IN ('02', '03')
          AND OtherId_Value IS NOT NULL AND OtherId_Value != ''
        ORDER BY OtherId_Code DESC
    """)
    iqama_map = {}
    for r in cursor.fetchall():
        sn = str(r.Source_Number).strip()
        if sn not in iqama_map:  # prefer Code '03' (loaded first due to DESC)
            iqama_map[sn] = str(r.OtherId_Value or "").strip()
    print(f"    {len(iqama_map)} iqama records (from tbOtherIds)")

    # 2e2. Load passport numbers from tbOtherIds (Source='C', Code='01')
    print("  Loading passport numbers from tbOtherIds...")
    cursor.execute("""
        SELECT Source_Number, OtherId_Value
        FROM tbOtherIds
        WHERE OtherId_Source = 'C'
          AND OtherId_Code = '01'
          AND OtherId_Value IS NOT NULL AND OtherId_Value != ''
    """)
    passport_map = {}
    for r in cursor.fetchall():
        sn = str(r.Source_Number).strip()
        passport_map[sn] = str(r.OtherId_Value or "").strip()
    print(f"    {len(passport_map)} passport records (from tbOtherIds)")

    # 2e. Load Arabic subject names
    print("  Loading Arabic subject names...")
    cursor.execute("SELECT Subject_Code, A_Subject_Name FROM Subject")
    arabic_subject_map = {}
    for r in cursor.fetchall():
        code = str(r.Subject_Code).strip()
        arabic_subject_map[code] = str(r.A_Subject_Name or "").strip()
    print(f"    {len(arabic_subject_map)} subject name mappings")

    # 2f. Load credit hours per class/subject + calculated flag
    print("  Loading credit hours...")
    cursor.execute("""
        SELECT Class_Code, Subject_Code, Credits, Calculated_Subject
        FROM Class_Subjects
    """)
    credit_map = {}  # (class_code, subject_code) → {credits, calculated}
    for r in cursor.fetchall():
        cc = str(r.Class_Code).strip()
        sc = str(r.Subject_Code).strip()
        credit_map[(cc, sc)] = {
            "credits": float(r.Credits) if r.Credits else 0.0,
            "calculated": bool(r.Calculated_Subject) if r.Calculated_Subject is not None else True,
        }
    print(f"    {len(credit_map)} class-subject credit entries")

    # ── RAW DATA: Load ALL columns from source tables ──
    # This ensures Firestore has every field, so future UI changes
    # never require a pipeline re-run.

    # 2g. Load ALL raw Student columns
    print("  Loading raw Student data (all columns)...")
    cursor.execute("SELECT * FROM Student")
    _s_cols = [c[0] for c in cursor.description]
    raw_student_data = {}
    for row in cursor.fetchall():
        sn = str(row[_s_cols.index('Student_Number')]).strip()
        raw_student_data[sn] = {
            c: safe(row[i]) for i, c in enumerate(_s_cols)
            if c not in ('DDS', 'RowGUID', 'DBGUID')
        }
    print(f"    {len(raw_student_data)} raw student records")

    # 2h. Load ALL raw Family_Children columns
    print("  Loading raw Family_Children data (all columns)...")
    cursor.execute("SELECT * FROM Family_Children")
    _fc_cols = [c[0] for c in cursor.description]
    raw_child_data = {}
    for row in cursor.fetchall():
        key = (str(row[_fc_cols.index('Family_Number')]).strip(), safe(row[_fc_cols.index('Child_Number')]))
        raw_child_data[key] = {
            c: safe(row[i]) for i, c in enumerate(_fc_cols)
            if c not in ('DDS', 'RowGUID', 'DBGUID')
        }
    print(f"    {len(raw_child_data)} raw child records")

    # 2i. Load ALL raw Family columns
    print("  Loading raw Family data (all columns)...")
    cursor.execute("SELECT * FROM Family")
    _f_cols = [c[0] for c in cursor.description]
    raw_family_data = {}
    for row in cursor.fetchall():
        fn = str(row[_f_cols.index('Family_Number')]).strip()
        raw_family_data[fn] = {
            c: safe(row[i]) for i, c in enumerate(_f_cols)
            if c not in ('DDS', 'RowGUID', 'DBGUID')
        }
    print(f"    {len(raw_family_data)} raw family records")

    # 2j. Load ALL raw Registration columns
    print("  Loading raw Registration data (all columns)...")
    cursor.execute("SELECT * FROM Registration")
    _r_cols = [c[0] for c in cursor.description]
    raw_reg_data = {}  # (student_number, year) → dict
    for row in cursor.fetchall():
        sn = str(row[_r_cols.index('Student_Number')]).strip()
        yr = str(row[_r_cols.index('Academic_Year')]).strip()
        raw_reg_data[(sn, yr)] = {
            c: safe(row[i]) for i, c in enumerate(_r_cols)
            if c not in ('DDS', 'RowGUID', 'DBGUID')
        }
    print(f"    {len(raw_reg_data)} raw registration records")

    # 2k. Load ALL raw Student_Previous_School columns
    print("  Loading raw previous school data (all columns)...")
    cursor.execute("SELECT * FROM Student_Previous_School")
    _ps_cols = [c[0] for c in cursor.description]
    raw_prev_school_data = {}  # student_number → dict (first entry)
    for row in cursor.fetchall():
        sn = str(row[_ps_cols.index('Student_Number')]).strip()
        if sn not in raw_prev_school_data:  # keep first entry
            raw_prev_school_data[sn] = {
                c: safe(row[i]) for i, c in enumerate(_ps_cols)
                if c not in ('DDS', 'RowGUID', 'DBGUID')
            }
    print(f"    {len(raw_prev_school_data)} raw previous school records")

    # 2l. Load ALL raw Sponsor columns
    print("  Loading raw Sponsor data (all columns)...")
    cursor.execute("SELECT * FROM Sponsor")
    _sp_cols = [c[0] for c in cursor.description]
    raw_sponsor_data = {}  # (student_number, year) → dict
    for row in cursor.fetchall():
        sn = str(row[_sp_cols.index('Student_Number')]).strip()
        yr = str(row[_sp_cols.index('Academic_Year')]).strip()
        raw_sponsor_data[(sn, yr)] = {
            c: safe(row[i]) for i, c in enumerate(_sp_cols)
            if c not in ('DDS', 'RowGUID', 'DBGUID')
        }
    print(f"    {len(raw_sponsor_data)} raw sponsor records")

    # 3. Get all grades (or just for one year)
    # Fetch ALL exam codes to build term-by-term breakdown.
    # Exam codes: 01=T1 Assess, 04=T1 Final, 05=Sem 1,
    #             06=T2 Assess, 09=T2 Final, 10=Sem 2,
    #             12=T3 Assess, 13=T3 Final, 14=Sem 3,
    #             11=Annual Total
    # Some years are 2-term, some 3-term.
    # Grade column is already a percentage (0–100).
    print("  Loading grades...")
    year_filter = ""
    if target_year:
        year_filter = f"AND g.Academic_Year = '{target_year}'"

    cursor.execute(f"""
        SELECT
            g.Student_Number,
            g.Academic_Year,
            g.Subject_Code,
            s.E_Subject_Name,
            g.Grade,
            g.Exam_Code,
            g.Subject_Class_Rank,
            g.Subject_Section_Rank,
            r.Class_Code,
            r.Section_Code,
            r.Major_Code
        FROM Grades g
        JOIN Subject s ON g.Subject_Code = s.Subject_Code
        JOIN Registration r
          ON g.Student_Number = r.Student_Number
         AND g.Academic_Year = r.Academic_Year
        WHERE g.Grade IS NOT NULL
          AND g.Exam_Code IN ('01','04','05','06','09','10','11','12','13','14')
          AND r.Termination_Date IS NULL
          {year_filter}
        ORDER BY g.Student_Number, g.Academic_Year
    """)

    # Group by student → year → exam → subjects
    # We'll prefer Exam 11 (Total), then 05 (Sem 1) + 10 (Sem 2)
    student_grades_raw = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    # Also keep a separate dict for ALL subjects (including non-academic) for transcript
    student_grades_all = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    reg_info = {}  # (student, year) → (class, section, major)

    row_count = 0
    # Subjects to exclude from academic analysis (but still stored for transcript)
    EXCLUDED_SUBJECTS = {"Attendance", "Art", "Physical Ed", "Conduct"}
    # Subjects to exclude from transcript entirely
    TRANSCRIPT_EXCLUDED = {"Attendance"}
    # Subjects that should show 0 credit hours on transcript
    ZERO_CREDIT_SUBJECTS = {"Conduct"}

    for r in cursor.fetchall():
        sn = str(r.Student_Number).strip()
        yr = str(r.Academic_Year).strip()
        exam = str(r.Exam_Code).strip()
        subj = str(r.E_Subject_Name or "").strip()
        subj_code = str(r.Subject_Code or "").strip()
        grade = safe(r.Grade)

        if subj and grade is not None:
            entry = {
                "subject": subj,
                "subject_code": subj_code,
                "grade": round(float(grade), 1),
                "class_rank": safe(r.Subject_Class_Rank),
                "section_rank": safe(r.Subject_Section_Rank),
            }
            # All subjects except transcript-excluded go to student_grades_all (for transcript)
            if subj not in TRANSCRIPT_EXCLUDED:
                student_grades_all[sn][yr][exam].append(entry)
            # Only non-excluded subjects go to student_grades_raw (for dashboard)
            if subj not in EXCLUDED_SUBJECTS:
                student_grades_raw[sn][yr][exam].append(entry)

        reg_key = (sn, yr)
        if reg_key not in reg_info:
            reg_info[reg_key] = {
                "class_code": str(r.Class_Code).strip() if r.Class_Code else None,
                "section_code": str(r.Section_Code).strip() if r.Section_Code else None,
                "major_code": str(r.Major_Code).strip() if r.Major_Code else None,
            }
        row_count += 1

    # Flatten: build per-term breakdown AND a single "best" subjects list for overall_avg
    # Exam mapping:
    TERM_MAP = {
        "01": "t1_assess",   # Term 1 Assessment
        "04": "t1_final",    # Term 1 Exam
        "05": "sem1",        # First Semester total
        "06": "t2_assess",   # Term 2 Assessment
        "09": "t2_final",    # Term 2 Exam
        "10": "sem2",        # Second Semester total
        "12": "t3_assess",   # Term 3 Assessment
        "13": "t3_final",    # Term 3 Exam
        "14": "sem3",        # Third Semester total
        "11": "annual",      # Annual Total
    }
    TERM_LABELS = {
        "t1_assess": "Term 1 Assessment",
        "t1_final": "Term 1 Final",
        "sem1": "First Semester",
        "t2_assess": "Term 2 Assessment",
        "t2_final": "Term 2 Final",
        "sem2": "Second Semester",
        "t3_assess": "Term 3 Assessment",
        "t3_final": "Term 3 Final",
        "sem3": "Third Semester",
        "annual": "Annual Total",
    }

    student_grades = defaultdict(lambda: defaultdict(lambda: {
        "subjects": [],
        "class_code": None,
        "section_code": None,
        "major_code": None,
    }))

    for sn, years in student_grades_raw.items():
        for yr, exams in years.items():
            ri = reg_info.get((sn, yr), {})
            yd = student_grades[sn][yr]
            yd["class_code"] = ri.get("class_code")
            yd["section_code"] = ri.get("section_code")
            yd["major_code"] = ri.get("major_code")

            # Build terms dict with per-subject grades for each exam code
            terms = {}
            for exam_code, subjects_list in exams.items():
                term_key = TERM_MAP.get(exam_code)
                if not term_key or not subjects_list:
                    continue
                subj_grades = []
                grade_sum = 0.0
                grade_count = 0
                for s in subjects_list:
                    subj_grades.append({
                        "subject": s["subject"],
                        "grade": s["grade"],
                    })
                    grade_sum += s["grade"]
                    grade_count += 1
                terms[term_key] = {
                    "label": TERM_LABELS[term_key],
                    "subjects": sorted(subj_grades, key=lambda x: x["subject"]),
                    "avg": round(grade_sum / grade_count, 1) if grade_count else 0,
                }
            yd["terms"] = terms

            # Determine number of terms for this year
            has_t3 = any(k in terms for k in ("t3_assess", "t3_final", "sem3"))
            yd["term_count"] = 3 if has_t3 else 2

            # Pick "best" subjects list for overall_avg (backward compat)
            if "11" in exams and exams["11"]:
                yd["subjects"] = exams["11"]
                yd["exam_label"] = "Annual"
            elif "05" in exams and "10" in exams:
                sem1 = {s["subject"]: s for s in exams["05"]}
                sem2 = {s["subject"]: s for s in exams["10"]}
                all_subjs = set(sem1.keys()) | set(sem2.keys())
                merged = []
                for subj_name in all_subjs:
                    s1 = sem1.get(subj_name)
                    s2 = sem2.get(subj_name)
                    if s1 and s2:
                        avg_g = round((s1["grade"] + s2["grade"]) / 2, 1)
                        merged.append({"subject": subj_name, "grade": avg_g,
                                       "class_rank": s2.get("class_rank"),
                                       "section_rank": s2.get("section_rank")})
                    elif s1:
                        merged.append(s1)
                    else:
                        merged.append(s2)
                yd["subjects"] = merged
                yd["exam_label"] = "Sem 1 + 2 Avg"
            elif "05" in exams:
                yd["subjects"] = exams["05"]
                yd["exam_label"] = "First Semester"
            elif "10" in exams:
                yd["subjects"] = exams["10"]
                yd["exam_label"] = "Second Semester"
            elif "14" in exams:
                yd["subjects"] = exams["14"]
                yd["exam_label"] = "Third Semester"

    print(f"    {row_count} grade records for {len(student_grades)} students")

    # 4. Compute class ranks per year per class/section
    print("  Computing class ranks...")
    # Collect: { (year, class_code, section_code) : [(student_number, avg)] }
    class_section_avgs = defaultdict(list)
    for sn, years_data in student_grades.items():
        for yr, yd in years_data.items():
            if yd["subjects"]:
                avg = round(sum(s["grade"] for s in yd["subjects"]) / len(yd["subjects"]), 1)
                key = (yr, yd["class_code"], yd["section_code"])
                class_section_avgs[key].append((sn, avg))

    # Sort and assign ranks
    rank_map = {}  # (student_number, year) → (rank, class_size)
    for key, students in class_section_avgs.items():
        students.sort(key=lambda x: -x[1])
        for rank_idx, (sn, _avg) in enumerate(students, 1):
            rank_map[(sn, key[0])] = (rank_idx, len(students))

    # 5. Build final documents
    print("  Building documents...")
    docs = {}
    for sn, years_data in student_grades.items():
        fam = student_family.get(sn, {})
        fam_num = fam.get("family_number", "")
        child_num = fam.get("child_number")
        child_key = (fam_num, child_num)
        child_info = child_names.get(child_key, {})

        years_out = {}
        for yr in sorted(years_data.keys()):
            yd = years_data[yr]
            subjects = sorted(yd["subjects"], key=lambda s: s["subject"])
            if not subjects:
                continue

            avg = round(sum(s["grade"] for s in subjects) / len(subjects), 1)
            rank_info = rank_map.get((sn, yr), (None, None))

            # Count pass/fail (pass >= 50%)
            pass_count = sum(1 for s in subjects if s["grade"] >= 50)
            fail_count = len(subjects) - pass_count

            # Strongest / weakest
            best = max(subjects, key=lambda s: s["grade"])
            worst = min(subjects, key=lambda s: s["grade"])

            # Resolve section name: prefer school/year-specific, fall back to generic
            sec_specific, sec_generic = section_map
            sec_code = yd["section_code"] or ""
            sec_key = (yr, yd["major_code"] or "", yd["class_code"] or "", sec_code)
            sec_name = sec_specific.get(sec_key, sec_generic.get(sec_code, sec_code))

            years_out[yr] = {
                "class_code": yd["class_code"],
                "class_name": class_map.get(yd["class_code"] or "", yd["class_code"] or ""),
                "section_code": yd["section_code"],
                "section_name": sec_name,
                "school": yd["major_code"] or "",
                "exam_label": yd.get("exam_label", ""),
                "overall_avg": avg,
                "subjects": subjects,
                "rank": rank_info[0],
                "class_size": rank_info[1],
                "pass_count": pass_count,
                "fail_count": fail_count,
                "strongest": {"subject": best["subject"], "grade": best["grade"]},
                "weakest": {"subject": worst["subject"], "grade": worst["grade"]},
                "terms": yd.get("terms", {}),
                "term_count": yd.get("term_count", 2),
            }

            # ── Transcript subjects (ALL subjects including non-academic, with credit hours) ──
            all_exams = student_grades_all.get(sn, {}).get(yr, {})
            class_code_for_credits = yd["class_code"] or ""
            transcript_subjects = []
            # Use exam 11 (Annual Total) if available, else merge sem1+sem2
            if "11" in all_exams:
                for s in all_exams["11"]:
                    sc = s.get("subject_code", "")
                    cr = credit_map.get((class_code_for_credits, sc), {})
                    ch = 0 if s["subject"] in ZERO_CREDIT_SUBJECTS else cr.get("credits", 0)
                    transcript_subjects.append({
                        "subject": s["subject"],
                        "subject_ar": arabic_subject_map.get(sc, ""),
                        "grade": s["grade"],
                        "credit_hours": ch,
                        "calculated": cr.get("calculated", True),
                    })
            elif "05" in all_exams and "10" in all_exams:
                sem1_map = {s["subject_code"]: s for s in all_exams["05"]}
                sem2_map = {s["subject_code"]: s for s in all_exams["10"]}
                all_codes = set(sem1_map.keys()) | set(sem2_map.keys())
                for sc in all_codes:
                    s1 = sem1_map.get(sc)
                    s2 = sem2_map.get(sc)
                    avg_grade = round(((s1["grade"] if s1 else 0) + (s2["grade"] if s2 else 0)) / (2 if s1 and s2 else 1), 1)
                    name = (s2 or s1)["subject"]
                    cr = credit_map.get((class_code_for_credits, sc), {})
                    ch = 0 if name in ZERO_CREDIT_SUBJECTS else cr.get("credits", 0)
                    transcript_subjects.append({
                        "subject": name,
                        "subject_ar": arabic_subject_map.get(sc, ""),
                        "grade": avg_grade,
                        "credit_hours": ch,
                        "calculated": cr.get("calculated", True),
                    })

            # Add semester-level grades for transcript columns (Sem1, Sem2, Sem3)
            transcript_sem1 = []
            transcript_sem2 = []
            transcript_sem3 = []
            if "05" in all_exams:
                for s in all_exams["05"]:
                    sc = s.get("subject_code", "")
                    cr = credit_map.get((class_code_for_credits, sc), {})
                    ch = 0 if s["subject"] in ZERO_CREDIT_SUBJECTS else cr.get("credits", 0)
                    transcript_sem1.append({
                        "subject": s["subject"],
                        "subject_ar": arabic_subject_map.get(sc, ""),
                        "grade": s["grade"],
                        "credit_hours": ch,
                        "calculated": cr.get("calculated", True),
                    })
            if "10" in all_exams:
                for s in all_exams["10"]:
                    sc = s.get("subject_code", "")
                    cr = credit_map.get((class_code_for_credits, sc), {})
                    ch = 0 if s["subject"] in ZERO_CREDIT_SUBJECTS else cr.get("credits", 0)
                    transcript_sem2.append({
                        "subject": s["subject"],
                        "subject_ar": arabic_subject_map.get(sc, ""),
                        "grade": s["grade"],
                        "credit_hours": ch,
                        "calculated": cr.get("calculated", True),
                    })
            if "14" in all_exams:
                for s in all_exams["14"]:
                    sc = s.get("subject_code", "")
                    cr = credit_map.get((class_code_for_credits, sc), {})
                    ch = 0 if s["subject"] in ZERO_CREDIT_SUBJECTS else cr.get("credits", 0)
                    transcript_sem3.append({
                        "subject": s["subject"],
                        "subject_ar": arabic_subject_map.get(sc, ""),
                        "grade": s["grade"],
                        "credit_hours": ch,
                        "calculated": cr.get("calculated", True),
                    })

            years_out[yr]["transcript_subjects"] = sorted(transcript_subjects, key=lambda x: x["subject"])
            years_out[yr]["transcript_sem1"] = sorted(transcript_sem1, key=lambda x: x["subject"])
            years_out[yr]["transcript_sem2"] = sorted(transcript_sem2, key=lambda x: x["subject"])
            years_out[yr]["transcript_sem3"] = sorted(transcript_sem3, key=lambda x: x["subject"])

        if not years_out:
            continue

        # Resolve nationality
        nat_code = child_info.get("nationality_code", "")
        nat = nationality_map.get(nat_code, {})

        # Previous school
        prev = prev_school_map.get(sn, {})

        docs[sn] = {
            "student_number": sn,
            "student_name": child_info.get("name", ""),
            "student_name_ar": child_info.get("name_ar", ""),
            "gender": child_info.get("gender", ""),
            "family_number": fam_num,
            "dob": child_info.get("dob"),
            "birth_place_en": child_info.get("birth_place_en", ""),
            "birth_place_ar": child_info.get("birth_place_ar", ""),
            "nationality_en": nat.get("en", ""),
            "nationality_ar": nat.get("ar", ""),
            "passport_id": passport_map.get(sn, ""),
            "iqama_number": iqama_map.get(sn, ""),
            "enrollment_date": enrollment_dates.get(sn),
            "prev_school_en": prev.get("en", ""),
            "prev_school_ar": prev.get("ar", ""),
            "prev_school_year": prev.get("year", ""),
            "years": years_out,
            "updated_at": datetime.utcnow().isoformat(),
            # ── Raw source data (all columns from SQL tables) ──
            # Stored so future UI changes never need a pipeline re-run.
            "raw_student": raw_student_data.get(sn, {}),
            "raw_family_child": raw_child_data.get(child_key, {}),
            "raw_family": raw_family_data.get(fam_num, {}),
            "raw_registrations": {
                yr: raw_reg_data.get((sn, yr), {}) for yr in years_out
            },
            "raw_prev_school": raw_prev_school_data.get(sn, {}),
            "raw_sponsors": {
                yr: raw_sponsor_data.get((sn, yr), {}) for yr in years_out
            },
        }

    print(f"  ✓ Built {len(docs)} student progress documents")
    return docs


def add_financial_data(cursor, student_docs):
    """
    Add per-student financial data from Student_Charges into existing
    student_progress documents.  Adds a 'financials' field:
    {
        "<academic_year>": {
            "total_charged": ...,
            "total_paid": ...,
            "total_discount": ...,
            "balance": ...,
            "installments": [
                { "label": "Installment 1", "charged": ..., "paid": ..., "discount": ..., "balance": ... },
                ...
            ]
        }
    }
    """
    print("\n── Adding financial data to student progress ──")

    # Load charge type → term mapping, and identify Opening Balance codes
    cursor.execute("SELECT Charge_Type_Code, E_Charge_Type_Desc, A_Charge_Type_Desc, Other_Modules FROM Charge_Type")
    charge_term_map = {}
    opening_bal_codes = set()
    for r in cursor.fetchall():
        code = str(r.Charge_Type_Code)
        desc = f"{r.E_Charge_Type_Desc or ''} {r.A_Charge_Type_Desc or ''}"
        charge_term_map[code] = parse_term(desc)
        if str(r.Other_Modules or "").strip() == "OpnBal":
            opening_bal_codes.add(code)

    # Load all charges
    cursor.execute("""
        SELECT Student_Number, Academic_Year, Charge_Type_Code,
               ISNULL(Amount_To_Be_Paid, 0) as charges,
               ISNULL(Paid_Amount, 0) as paid,
               ISNULL(Discount_Amount, 0) as discount,
               ISNULL(Balance, 0) as balance
        FROM Student_Charges
    """)

    # Group: student → year → installment
    stu_fin = defaultdict(lambda: defaultdict(lambda: defaultdict(
        lambda: {"charged": 0.0, "paid": 0.0, "discount": 0.0, "balance": 0.0}
    )))
    # Track Opening Balance amounts per student → year
    stu_opening_bal = defaultdict(lambda: defaultdict(float))
    row_count = 0
    for r in cursor.fetchall():
        sn = str(r.Student_Number).strip()
        yr = str(r.Academic_Year).strip()
        ctc = str(r.Charge_Type_Code or "")
        term = charge_term_map.get(ctc, 0)
        label = {1: "Installment 1", 2: "Installment 2", 3: "Installment 3", 0: "Other"}[term]
        stu_fin[sn][yr][label]["charged"] += float(r.charges)
        stu_fin[sn][yr][label]["paid"] += float(r.paid)
        stu_fin[sn][yr][label]["discount"] += float(r.discount)
        stu_fin[sn][yr][label]["balance"] += float(r.balance)
        if ctc in opening_bal_codes:
            stu_opening_bal[sn][yr] += float(r.charges)
        row_count += 1

    enriched = 0
    for sn, doc in student_docs.items():
        if sn not in stu_fin:
            continue

        financials = {}
        for yr, installments in stu_fin[sn].items():
            total_c = sum(v["charged"] for v in installments.values())
            total_p = sum(v["paid"] for v in installments.values())
            total_d = sum(v["discount"] for v in installments.values())
            total_b = sum(v["balance"] for v in installments.values())

            inst_list = []
            for lbl in ["Installment 1", "Installment 2", "Installment 3", "Other"]:
                if lbl in installments:
                    v = installments[lbl]
                    inst_list.append({
                        "label": lbl,
                        "charged": round(v["charged"], 2),
                        "paid": round(v["paid"], 2),
                        "discount": round(v["discount"], 2),
                        "balance": round(v["balance"], 2),
                    })

            financials[yr] = {
                "total_charged": round(total_c, 2),
                "total_paid": round(total_p, 2),
                "total_discount": round(total_d, 2),
                "balance": round(total_b, 2),
                "opening_balance": round(stu_opening_bal[sn].get(yr, 0), 2),
                "installments": inst_list,
            }

        if financials:
            doc["financials"] = financials
            enriched += 1

    print(f"  {row_count} charge records processed")
    print(f"  ✓ Added financial data to {enriched} student documents")


def parse_term(desc):
    """Derive installment number (1/2/3) from a charge type description."""
    import re
    if re.search(r"(?:Fees|Term)\s*1\b", desc, re.I):
        return 1
    if re.search(r"(?:Fees|Term)\s*2\b", desc, re.I):
        return 2
    if re.search(r"(?:Fees|Term)\s*3\b", desc, re.I):
        return 3
    if re.search(r"الأول|الاول", desc):
        return 1
    if re.search(r"الثاني", desc):
        return 2
    if re.search(r"الثالث", desc):
        return 3
    return 0


def build_family_docs(cursor, student_progress_docs, class_map, section_map):
    """
    Build family documents for parent login.
    Returns a dict: { familyNumber: document_dict }
    """
    print("\n── Building family documents ──")

    # 1. Get family credentials and contact info
    cursor.execute("""
        SELECT
            Family_Number,
            Family_UserName,
            Family_Password,
            E_Father_Name,
            E_Family_Name,
            Father_phone,
            Father_Email,
            Mother_phone,
            Mother_Email
        FROM Family
        WHERE Family_UserName IS NOT NULL
          AND Family_Password IS NOT NULL
    """)

    families_raw = {}
    for r in cursor.fetchall():
        fn = str(r.Family_Number).strip()
        families_raw[fn] = {
            "family_number": fn,
            "username": str(r.Family_UserName or "").strip(),
            "password": hash_pw(str(r.Family_Password or "").strip()),
            "father_name": str(r.E_Father_Name or "").strip(),
            "family_name": str(r.E_Family_Name or "").strip(),
            "father_phone": str(r.Father_phone or "").strip(),
            "father_email": str(r.Father_Email or "").strip(),
            "mother_phone": str(r.Mother_phone or "").strip(),
            "mother_email": str(r.Mother_Email or "").strip(),
        }
    print(f"  {len(families_raw)} families with credentials")

    # 2. Get student → family mapping to link children
    cursor.execute("""
        SELECT s.Student_Number, s.Family_Number, s.Child_Number,
               fc.E_Child_Name, fc.Gender
        FROM Student s
        LEFT JOIN Family_Children fc
          ON s.Family_Number = fc.Family_Number
         AND s.Child_Number = fc.Child_Number
        WHERE s.Family_Number IS NOT NULL
    """)

    family_children = defaultdict(list)
    for r in cursor.fetchall():
        fn = str(r.Family_Number).strip()
        sn = str(r.Student_Number).strip()

        # Build full name: first name + family last name
        first_name = str(r.E_Child_Name or "").strip()
        family_last = families_raw.get(fn, {}).get("family_name", "")
        full_name = f"{first_name} {family_last}".strip() if first_name else family_last

        # Get current enrollment from progress doc
        current_class = ""
        current_section = ""
        current_year = ""
        prog = student_progress_docs.get(sn)
        if prog and prog.get("years"):
            latest_yr = max(prog["years"].keys())
            latest = prog["years"][latest_yr]
            current_class = latest.get("class_name", "")
            current_section = latest.get("section_name", "")
            current_year = latest_yr

        family_children[fn].append({
            "student_number": sn,
            "child_name": full_name,
            "gender": "Male" if r.Gender else "Female",
            "current_class": current_class,
            "current_section": current_section,
            "current_year": current_year,
            "has_progress": prog is not None,
        })

    # 3. Build family documents (only for families that have children with progress data)
    docs = {}
    for fn, fam_data in families_raw.items():
        children = family_children.get(fn, [])
        children_with_progress = [c for c in children if c.get("has_progress")]

        if not children_with_progress:
            continue

        # Remove 'has_progress' field before storing
        for c in children_with_progress:
            c.pop("has_progress", None)

        docs[fn] = {
            **fam_data,
            "children": children_with_progress,
            "updated_at": datetime.utcnow().isoformat(),
        }

    print(f"  ✓ Built {len(docs)} family documents (with enrolled children)")
    return docs


def _doc_hash(doc_data):
    """Compute a stable hash of a document dict for change detection."""
    # Remove updated_at since it always changes
    d = {k: v for k, v in doc_data.items() if k != "updated_at"}
    raw = json.dumps(d, sort_keys=True, default=str)
    return hashlib.md5(raw.encode()).hexdigest()


# In-memory hash cache: collection -> doc_id -> hash
_hash_cache_path = os.path.join(os.path.dirname(__file__), ".upload_hashes.json")


def _load_hash_cache():
    if os.path.exists(_hash_cache_path):
        try:
            with open(_hash_cache_path, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _save_hash_cache(cache):
    with open(_hash_cache_path, "w") as f:
        json.dump(cache, f)


def upload_to_firestore(db, collection_name, docs, label="documents", merge=False):
    """Upload documents to Firestore in batches with change detection.
    Skips documents whose content hasn't changed since last successful upload.
    """
    mode_label = " (merge)" if merge else " (overwrite)"
    
    # Load hash cache and filter to only changed docs
    cache = _load_hash_cache()
    col_cache = cache.get(collection_name, {})
    
    changed_items = []
    new_hashes = {}  # doc_id -> hash  (saved only after successful upload)
    skipped = 0
    for doc_id, doc_data in docs.items():
        h = _doc_hash(doc_data)
        if col_cache.get(doc_id) == h:
            skipped += 1
        else:
            changed_items.append((doc_id, doc_data))
            new_hashes[doc_id] = h
    
    total = len(changed_items)
    if total == 0:
        print(f"\n  '{collection_name}': {skipped} docs unchanged — nothing to upload ✓")
        return
    
    print(f"\n  Uploading {total} {label} to '{collection_name}'{mode_label} ({skipped} unchanged, skipped)...")
    
    uploaded = 0
    for i in range(0, total, BATCH_SIZE):
        chunk = changed_items[i:i + BATCH_SIZE]
        batch = db.batch()
        for doc_id, doc_data in chunk:
            ref = db.collection(collection_name).document(doc_id)
            if merge:
                batch.set(ref, doc_data, merge=True)
            else:
                batch.set(ref, doc_data)
        batch.commit()
        uploaded += len(chunk)
        print(f"    Batch {i // BATCH_SIZE + 1}: {uploaded}/{total}")
    
    # Save updated hash cache only after ALL batches succeed
    col_cache.update(new_hashes)
    cache[collection_name] = col_cache
    _save_hash_cache(cache)
    
    print(f"  ✓ Uploaded {uploaded} documents to '{collection_name}'")


def main():
    target_year = sys.argv[1] if len(sys.argv) > 1 else None

    # ── Connect to SQL Server ──
    conn_str = (
        f"DRIVER={{ODBC Driver 17 for SQL Server}};"
        f"SERVER={SERVER};"
        f"DATABASE={TEMP_DB};"
        f"Trusted_Connection=yes;"
    )
    conn = pyodbc.connect(conn_str)
    cursor = conn.cursor()
    print(f"Connected to SQL Server: {SERVER}/{TEMP_DB}")

    # ── Initialize Firebase ──
    if not firebase_admin._apps:
        cred = credentials.Certificate(KEY_PATH)
        firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("Connected to Firestore")

    # ── Load reference data ──
    class_map = get_class_name_map(cursor)
    section_specific, section_generic = get_section_name_map(cursor)
    print(f"Loaded {len(class_map)} classes, {len(section_specific)} section entries")

    # ── Build student progress ──
    student_docs = build_student_progress(cursor, class_map, (section_specific, section_generic), target_year)

    # ── Add financial data ──
    add_financial_data(cursor, student_docs)

    # ── Build family documents ──
    family_docs = build_family_docs(cursor, student_docs, class_map, (section_specific, section_generic))

    # Build username → family_number index for fast login lookup
    username_index = {}
    for fn, fd in family_docs.items():
        un = fd.get("username", "")
        if un:
            username_index[un] = fn

    # ── Build browse index ──
    # Lightweight per-year lists: { "25-26": { "33__01__0021-01": [ {sn, name, gender, fam, avg}, ... ] } }
    # Key format: classCode__sectionCode__school
    print("\n── Building browse index ──")
    browse_index = {}  # year -> bucket_key -> list of student summaries
    for sn, doc in student_docs.items():
        for yr, yd in doc.get("years", {}).items():
            cc = yd.get("class_code", "")
            sc = yd.get("section_code", "")
            school = yd.get("school", "")
            if not cc:
                continue
            bucket_key = f"{cc}__{sc}__{school}"
            browse_index.setdefault(yr, {}).setdefault(bucket_key, []).append({
                "sn": sn,
                "name": doc.get("student_name", ""),
                "gender": doc.get("gender", ""),
                "fam": doc.get("family_number", ""),
                "avg": yd.get("overall_avg", 0),
                "class": yd.get("class_name", ""),
                "section": yd.get("section_name", ""),
            })
    total_entries = sum(len(v) for buckets in browse_index.values() for v in buckets.values())
    print(f"  {len(browse_index)} years, {total_entries} entries")

    # ── Upload to Firestore ──
    # When running for a single year, merge to preserve other years' data
    use_merge = target_year is not None
    upload_to_firestore(db, "student_progress", student_docs, "student progress docs", merge=use_merge)
    upload_to_firestore(db, "families", family_docs, "family docs", merge=use_merge)

    # Upload username index (single document for fast lookup)
    print("\n  Uploading username index...")
    db.collection("parent_config").document("username_index").set({
        "index": username_index,
        "updated_at": datetime.utcnow().isoformat(),
    })
    print(f"  ✓ Username index: {len(username_index)} entries")

    # Upload browse index (one document per year for fast browse)
    print("\n  Uploading browse index...")
    for yr, buckets in browse_index.items():
        db.collection("parent_config").document(f"browse_{yr}").set({
            "year": yr,
            "buckets": buckets,
            "updated_at": datetime.utcnow().isoformat(),
        })
        print(f"    browse_{yr}: {len(buckets)} class/section groups")
    print(f"  ✓ Browse index: {len(browse_index)} year documents")

    # ── Summary ──
    cursor.close()
    conn.close()

    print(f"\n{'='*60}")
    print(f"✓ Done!")
    print(f"  • {len(student_docs)} student progress documents → student_progress/")
    print(f"  • {len(family_docs)} family documents → families/")
    print(f"  • Username index → parent_config/username_index")
    print(f"  • Browse index → parent_config/browse_{{year}} ({len(browse_index)} years)")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()

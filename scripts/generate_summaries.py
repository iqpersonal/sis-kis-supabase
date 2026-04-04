"""
Generate pre-aggregated summary documents in Firestore.
Reads raw data from SQL Server and writes one summary document per academic year
to the 'summaries' collection.  This reduces Firestore reads on the dashboard
from ~47 000 per session to ~1.

Usage:
    python generate_summaries.py           # generate for all years
    python generate_summaries.py 25-26     # generate for a specific year
"""

import os
import re
import sys
import json
from datetime import date, datetime
from decimal import Decimal
from collections import defaultdict

try:
    import pyodbc
except ImportError:
    sys.exit("pyodbc required: pip install pyodbc")

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    sys.exit("firebase-admin required: pip install firebase-admin")

from db_config import connect_sql

# Legacy fallback (only used if connect_sql fails)
SERVER = r"localhost\SQLEXPRESS"
TEMP_DB = "_bak_import_temp"
KEY_PATH = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")

# ─── Month helpers ──────────────────────────────────────────────────
MONTH_NAMES = ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb",
               "Mar", "Apr", "May", "Jun", "Jul", "Aug"]
MONTH_ORDER = {9: 0, 10: 1, 11: 2, 12: 3, 1: 4, 2: 5,
               3: 6, 4: 7, 5: 8, 6: 9, 7: 10, 8: 11}

GRADE_RANGES = [
    ("90–100", 90, 100),
    ("80–89",  80, 89.99),
    ("70–79",  70, 79.99),
    ("60–69",  60, 69.99),
    ("50–59",  50, 59.99),
    ("< 50",    0, 49.99),
]


def json_safe(val):
    if val is None:
        return None
    if isinstance(val, Decimal):
        return float(val)
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    if isinstance(val, bytes):
        return None  # skip binary
    return val


def _build_student_detail(sn, student_detail_map, student_grades_map, **extra):
    """Build a detail sub-dict for a student to embed in summary lists.
    
    Extra context fields can be passed via **extra and will be merged in.
    e.g. failingSubjects=[], absenceByMonth=[], balanceByTerm=[], examTrend=[], ...
    """
    info = student_detail_map.get(sn, {})
    grades = student_grades_map.get(sn, {})
    subjects = [{"subject": s, "grade": g} for s, g in sorted(grades.items())]
    detail = {
        "gender": info.get("gender", ""),
        "dob": info.get("dob", ""),
        "nationality": info.get("nationality", ""),
        "section": info.get("section", ""),
        "subjects": subjects[:25],
    }
    detail.update(extra)
    return detail


def parse_term(desc: str) -> int:
    """Derive installment number (1/2/3) from a charge type description."""
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


def month_label(m: int) -> str:
    idx = MONTH_ORDER.get(m)
    if idx is not None and 0 <= idx < len(MONTH_NAMES):
        return MONTH_NAMES[idx]
    return f"M{m}"


def extract_month(date_str) -> int | None:
    if not date_str:
        return None
    s = str(date_str)
    m = re.search(r"(\d{4})-(\d{2})-", s)
    if not m:
        return None
    return int(m.group(2))


def empty_school_data():
    return {
        "total_students": 0,
        "active_registrations": 0,
        "total_registrations": 0,
        "financials": {
            "installments": [],
            "chart": [],
        },
        "nationalities": [],
        "academics": {
            "total_exams": 0,
            "pass_rate": 0,
            "avg_grade": 0,
            "total_absence_days": 0,
            "total_tardy": 0,
            "pass_fail": [],
            "grade_distribution": [],
            "attendance_by_month": [],
            "class_breakdown": [],
        },
        "attendance_detail": {
            "total_absence_days": 0,
            "total_tardy": 0,
            "students_with_absences": 0,
            "students_with_tardy": 0,
            "avg_absence_per_student": 0,
            "avg_tardy_per_student": 0,
            "top_absentees": [],
            "absence_by_class": [],
            "tardy_by_class": [],
        },
        "delinquency": {
            "total_charged": 0,
            "total_paid": 0,
            "total_outstanding": 0,
            "total_discount": 0,
            "collection_rate": 0,
            "students_fully_paid": 0,
            "students_with_balance": 0,
            "students_zero_paid": 0,
            "balance_by_installment": [],
            "balance_by_class": [],
            "top_delinquents": [],
        },
        "subject_performance": {
            "subjects": [],            # [{name, avg, min, max, sectionCount}]
            "heatmap": [],              # [{className, subjects: [{name, avg}]}]
            "strongest_subject": "",
            "weakest_subject": "",
        },
        "term_progress": {
            "terms": [],                # [{termCode, termName, avgGrade, passRate, count}]
            "term_by_subject": [],      # [{subject, terms: [{term, avg}]}]
        },
        "subject_trends": {
            "trends": [],               # [{subject, years: [{year, avg}]}]
        },
        "honor_roll": {
            "total_honor": 0,
            "honor_rate": 0,
            "top_students": [],         # [{studentNumber, avg, classRank, secRank, className}]
            "honor_by_class": [],       # [{className, count, rate}]
        },
        "at_risk": {
            "total_at_risk": 0,
            "at_risk_rate": 0,
            "at_risk_students": [],     # [{studentNumber, avg, absenceDays, className}]
            "at_risk_by_class": [],     # [{className, count, rate}]
        },
    }


def build_summary_for_year(cursor, year, all_years, charge_type_term_map,
                           nationality_map, class_name_map, db_fs=None):
    """Build the full summary document for one academic year."""

    summary = {
        "academic_year": str(year),
        "updated_at": datetime.now(tz=None).isoformat(),
        "all": empty_school_data(),
        "0021-01": empty_school_data(),
        "0021-02": empty_school_data(),
        "reg_counts_all_years": [],
    }

    year_val = year  # could be int or string in SQL

    # ── Registration counts (all years for chart) ──
    cursor.execute("""
        SELECT Academic_Year, COUNT(*) as cnt
        FROM Registration
        GROUP BY Academic_Year
        ORDER BY Academic_Year
    """)
    summary["reg_counts_all_years"] = [
        {"year": str(r.Academic_Year), "count": r.cnt}
        for r in cursor.fetchall()
    ]

    # ── Registrations for this year ──
    cursor.execute("""
        SELECT Student_Number, Major_Code, Termination_Date, Section_Code, Class_Code
        FROM Registration
        WHERE Academic_Year = ?
    """, year_val)
    registrations = cursor.fetchall()

    # Build student→major mapping; per-major student sets
    student_major = {}     # student_number → major_code
    student_class = {}     # student_number → class_code
    major_students = {"0021-01": set(), "0021-02": set()}
    major_active = {"0021-01": 0, "0021-02": 0}
    all_student_numbers = set()
    all_active = 0

    for r in registrations:
        sn = str(r.Student_Number)
        mc = str(r.Major_Code or "")
        all_student_numbers.add(sn)
        student_major[sn] = mc
        student_class[sn] = str(r.Class_Code or "")

        is_active = r.Termination_Date is None
        if is_active:
            all_active += 1

        if mc in major_students:
            major_students[mc].add(sn)
            if is_active:
                major_active[mc] += 1

    summary["all"]["total_registrations"] = len(registrations)
    summary["all"]["active_registrations"] = all_active
    summary["all"]["total_students"] = len(all_student_numbers)

    for mc in ("0021-01", "0021-02"):
        summary[mc]["total_registrations"] = len([
            r for r in registrations if str(r.Major_Code or "") == mc
        ])
        summary[mc]["active_registrations"] = major_active[mc]
        summary[mc]["total_students"] = len(major_students[mc])

    # ── Student name & detail lookup ──
    cursor.execute("""
        SELECT DISTINCT r.Student_Number,
               ISNULL(fc.E_Child_Name, '') as first_name,
               ISNULL(f.E_Family_Name, '') as last_name,
               fc.Gender,
               fc.Child_Birth_Date,
               fc.Nationality_Code_Primary,
               ISNULL(n.E_Nationality_Name, '') as nationality_name,
               r.Section_Code,
               ISNULL(sec.E_Section_Name, '') as section_name,
               s.Family_Number
        FROM Registration r
        JOIN Student s ON r.Student_Number = s.Student_Number
        JOIN Family_Children fc
          ON s.Family_Number = fc.Family_Number
         AND s.Child_Number  = fc.Child_Number
        JOIN Family f ON s.Family_Number = f.Family_Number
        LEFT JOIN Nationality n ON fc.Nationality_Code_Primary = n.Nationality_Code
        LEFT JOIN Section sec ON r.Section_Code = sec.Section_Code
        WHERE r.Academic_Year = ?
    """, year_val)
    student_name_map = {}   # student_number → full name
    student_detail_map = {} # student_number → {gender, dob, nationality, section}
    student_family_map = {} # student_number → family_number
    student_section_map = {} # student_number → section_code
    family_name_map = {}    # family_number → family_name (last name)
    for r in cursor.fetchall():
        sn = str(r.Student_Number)
        first = str(r.first_name or "").strip()
        last = str(r.last_name or "").strip()
        student_name_map[sn] = f"{first} {last}".strip() or sn
        gender_code = str(r.Gender or "").strip()
        student_detail_map[sn] = {
            "gender": "Male" if gender_code == "1" else ("Female" if gender_code == "2" else gender_code),
            "dob": str(r.Child_Birth_Date or "")[:10],
            "nationality": str(r.nationality_name or "").strip(),
            "section": str(r.section_name or "").strip(),
        }
        fam_num = str(r.Family_Number or "")
        student_family_map[sn] = fam_num
        student_section_map[sn] = str(r.Section_Code or "")
        if fam_num and last:
            family_name_map[fam_num] = last

    # ── Subject grades per student (for detail view) ──
    # Get latest exam grades for all students in this year
    cursor.execute("""
        SELECT g.Student_Number, sub.E_Subject_Name, g.Grade, g.Exam_Code
        FROM Grades g
        JOIN Subject sub ON g.Subject_Code = sub.Subject_Code
        WHERE g.Academic_Year = ? AND g.Grade IS NOT NULL
        ORDER BY g.Exam_Code DESC
    """, year_val)
    student_grades_map = defaultdict(dict)  # sn → {subject: grade}
    for r in cursor.fetchall():
        sn = str(r.Student_Number)
        subj = str(r.E_Subject_Name or "").strip()
        if subj and subj not in student_grades_map[sn]:
            student_grades_map[sn][subj] = round(float(r.Grade), 1) if r.Grade else 0

    # ── Nationality distribution ──
    # Join Registration→Student→Family_Children to get nationality per student
    cursor.execute("""
        SELECT DISTINCT r.Student_Number, fc.Nationality_Code_Primary
        FROM Registration r
        JOIN Student s ON r.Student_Number = s.Student_Number
        JOIN Family_Children fc
          ON s.Family_Number = fc.Family_Number
         AND s.Child_Number  = fc.Child_Number
        WHERE r.Academic_Year = ?
    """, year_val)
    student_nat = {}
    for r in cursor.fetchall():
        student_nat[str(r.Student_Number)] = str(r.Nationality_Code_Primary or "Unknown")

    # Count per filter level (all, per-major)
    for filter_key, student_set in [("all", all_student_numbers),
                                     ("0021-01", major_students["0021-01"]),
                                     ("0021-02", major_students["0021-02"])]:
        nat_counts = defaultdict(int)
        for sn in student_set:
            code = student_nat.get(sn, "Unknown")
            name = nationality_map.get(code, code)
            nat_counts[name] += 1
        # Top 5 + Others
        sorted_nats = sorted(nat_counts.items(), key=lambda x: -x[1])
        top5 = sorted_nats[:5]
        others = sum(v for _, v in sorted_nats[5:])
        result = [{"name": n, "value": v} for n, v in top5]
        if others > 0:
            result.append({"name": "Others", "value": others})
        summary[filter_key]["nationalities"] = result

    # ── Financial data ──
    cursor.execute("""
        SELECT Student_Number, Charge_Type_Code,
               ISNULL(Amount_To_Be_Paid, 0) as charges,
               ISNULL(Paid_Amount, 0) as paid,
               ISNULL(Discount_Amount, 0) as discount,
               ISNULL(Balance, 0) as balance
        FROM Student_Charges
        WHERE Academic_Year = ?
    """, year_val)
    charges = cursor.fetchall()

    # Build per-student charge-by-term breakdown for detail dialogs
    stu_charge_by_term = defaultdict(lambda: defaultdict(lambda: {"charged": 0.0, "paid": 0.0, "balance": 0.0}))
    for ch in charges:
        sn = str(ch.Student_Number)
        term = charge_type_term_map.get(str(ch.Charge_Type_Code or ""), 0)
        label = {1: "Installment 1", 2: "Installment 2", 3: "Installment 3", 0: "Other"}[term]
        stu_charge_by_term[sn][label]["charged"] += float(ch.charges)
        stu_charge_by_term[sn][label]["paid"] += float(ch.paid)
        stu_charge_by_term[sn][label]["balance"] += float(ch.balance)

    for filter_key, student_set in [("all", all_student_numbers),
                                     ("0021-01", major_students["0021-01"]),
                                     ("0021-02", major_students["0021-02"])]:
        buckets = {0: [0, 0, 0, 0], 1: [0, 0, 0, 0],
                   2: [0, 0, 0, 0], 3: [0, 0, 0, 0]}
        total_c = total_p = total_b = 0
        for c in charges:
            sn = str(c.Student_Number)
            if filter_key != "all" and sn not in student_set:
                continue
            term = charge_type_term_map.get(str(c.Charge_Type_Code or ""), 0)
            buckets[term][0] += float(c.charges)
            buckets[term][1] += float(c.paid)
            buckets[term][2] += float(c.discount)
            buckets[term][3] += float(c.balance)
            total_c += float(c.charges)
            total_p += float(c.paid)
            total_b += float(c.balance)

        labels = {1: "Installment 1", 2: "Installment 2",
                  3: "Installment 3", 0: "Other"}
        installments = []
        for t in (1, 2, 3, 0):
            installments.append({
                "term": t,
                "label": labels[t],
                "totalCharges": buckets[t][0],
                "totalPaid": buckets[t][1],
                "totalDiscount": buckets[t][2],
                "outstandingBalance": buckets[t][3],
            })

        chart_data = [{
            "year": str(year),
            "charges": total_c,
            "collected": total_p,
            "balance": total_b,
        }]

        summary[filter_key]["financials"] = {
            "installments": installments,
            "chart": chart_data,
        }

    # ── Exam results ──
    cursor.execute("""
        SELECT Student_Number, Student_Result, Final_Average_Grade
        FROM Student_Exam_Results
        WHERE Academic_Year = ?
    """, year_val)
    exams = cursor.fetchall()

    for filter_key, student_set in [("all", all_student_numbers),
                                     ("0021-01", major_students["0021-01"]),
                                     ("0021-02", major_students["0021-02"])]:
        total_e = 0
        pass_c = fail_c = other_c = 0
        grade_sum = 0.0
        grade_buckets = {r[0]: 0 for r in GRADE_RANGES}
        class_exams = defaultdict(lambda: {"total": 0, "sum": 0.0, "pass": 0})

        for e in exams:
            sn = str(e.Student_Number)
            if filter_key != "all" and sn not in student_set:
                continue
            total_e += 1
            result = str(e.Student_Result or "").upper()
            grade = float(e.Final_Average_Grade or 0)

            if result == "P":
                pass_c += 1
            elif result == "F":
                fail_c += 1
            else:
                other_c += 1
            grade_sum += grade

            # Grade distribution
            for label, lo, hi in GRADE_RANGES:
                if lo <= grade <= hi:
                    grade_buckets[label] += 1
                    break

            # Class breakdown
            cc = student_class.get(sn, "")
            if cc:
                class_exams[cc]["total"] += 1
                class_exams[cc]["sum"] += grade
                if result == "P":
                    class_exams[cc]["pass"] += 1

        pass_rate = (pass_c / total_e * 100) if total_e > 0 else 0
        avg_grade = (grade_sum / total_e) if total_e > 0 else 0

        pass_fail = []
        if pass_c > 0:
            pass_fail.append({"name": "Pass", "value": pass_c, "color": "#22c55e"})
        if fail_c > 0:
            pass_fail.append({"name": "Fail", "value": fail_c, "color": "#ef4444"})
        if other_c > 0:
            pass_fail.append({"name": "Other", "value": other_c, "color": "#f59e0b"})

        grade_dist = [{"range": r[0], "students": grade_buckets[r[0]]}
                      for r in GRADE_RANGES]

        summary[filter_key]["academics"]["total_exams"] = total_e
        summary[filter_key]["academics"]["pass_rate"] = round(pass_rate, 2)
        summary[filter_key]["academics"]["avg_grade"] = round(avg_grade, 2)
        summary[filter_key]["academics"]["pass_fail"] = pass_fail
        summary[filter_key]["academics"]["grade_distribution"] = grade_dist

        # ── Class breakdown (finish after absences) ──
        # Store intermediate class_exams for later
        summary[filter_key]["_class_exams"] = dict(class_exams)

    # ── Absences ──
    cursor.execute("""
        SELECT Student_Number, Absence_Date, ISNULL(No_of_Days, 1) as days,
               Absence_Reason_Code
        FROM Student_Absence
        WHERE Academic_Year = ?
    """, year_val)
    absences = cursor.fetchall()

    # Build per-student absence context for detail dialogs
    stu_absence_monthly = defaultdict(lambda: defaultdict(int))   # sn → {month_label: days}
    stu_absence_reasons = defaultdict(lambda: defaultdict(int))   # sn → {reason: count}
    absence_reason_map = {}
    cursor.execute("SELECT Absence_Reason_Code, E_Absence_Reason_Desc FROM Absence_Reason")
    for r in cursor.fetchall():
        name = str(r.E_Absence_Reason_Desc or "").strip()
        absence_reason_map[str(r.Absence_Reason_Code)] = name if name else "Unknown"
    for a in absences:
        sn = str(a.Student_Number)
        days = int(a.days)
        m = extract_month(a.Absence_Date)
        if m is not None:
            stu_absence_monthly[sn][month_label(m)] += days
        rc = str(a.Absence_Reason_Code or "").strip()
        reason_name = absence_reason_map.get(rc, rc or "Unknown")
        if reason_name:
            stu_absence_reasons[sn][reason_name] += days

    for filter_key, student_set in [("all", all_student_numbers),
                                     ("0021-01", major_students["0021-01"]),
                                     ("0021-02", major_students["0021-02"])]:
        total_abs_days = 0
        month_abs = defaultdict(int)
        class_absences = defaultdict(int)

        for a in absences:
            sn = str(a.Student_Number)
            if filter_key != "all" and sn not in student_set:
                continue
            days = int(a.days)
            total_abs_days += days
            m = extract_month(a.Absence_Date)
            if m is not None:
                month_abs[m] += days
            cc = student_class.get(sn, "")
            if cc:
                class_absences[cc] += days

        summary[filter_key]["academics"]["total_absence_days"] = total_abs_days
        summary[filter_key]["_class_absences"] = dict(class_absences)
        summary[filter_key]["_month_abs"] = dict(month_abs)

    # ── Tardies ──
    cursor.execute("""
        SELECT Student_Number, Tardy_date
        FROM Student_Tardy
        WHERE Academic_year = ?
    """, year_val)
    tardies = cursor.fetchall()

    for filter_key, student_set in [("all", all_student_numbers),
                                     ("0021-01", major_students["0021-01"]),
                                     ("0021-02", major_students["0021-02"])]:
        total_tardy = 0
        month_tardy = defaultdict(int)

        for t in tardies:
            sn = str(t.Student_Number)
            if filter_key != "all" and sn not in student_set:
                continue
            total_tardy += 1
            m = extract_month(t.Tardy_date)
            if m is not None:
                month_tardy[m] += 1

        summary[filter_key]["academics"]["total_tardy"] = total_tardy

        # Combine attendance by month (absences + tardies)
        month_abs = summary[filter_key].pop("_month_abs", {})
        all_months = sorted(
            set(month_abs.keys()) | set(month_tardy.keys()),
            key=lambda x: MONTH_ORDER.get(x, x)
        )
        attendance = [
            {"month": month_label(m),
             "absences": month_abs.get(m, 0),
             "tardy": month_tardy.get(m, 0)}
            for m in all_months
        ]
        summary[filter_key]["academics"]["attendance_by_month"] = attendance

    # ── Attendance detail (for Attendance & Conduct report) ──
    for filter_key, student_set in [("all", all_student_numbers),
                                     ("0021-01", major_students["0021-01"]),
                                     ("0021-02", major_students["0021-02"])]:
        stu_abs_days = defaultdict(int)
        stu_tardy_count = defaultdict(int)
        class_abs_total = defaultdict(int)
        class_tardy_total = defaultdict(int)
        class_stu_set = defaultdict(set)

        for a in absences:
            sn = str(a.Student_Number)
            if filter_key != "all" and sn not in student_set:
                continue
            days = int(a.days)
            stu_abs_days[sn] += days
            cc = student_class.get(sn, "")
            if cc:
                class_abs_total[cc] += days
                class_stu_set[cc].add(sn)

        for t in tardies:
            sn = str(t.Student_Number)
            if filter_key != "all" and sn not in student_set:
                continue
            stu_tardy_count[sn] += 1
            cc = student_class.get(sn, "")
            if cc:
                class_tardy_total[cc] += 1
                class_stu_set[cc].add(sn)

        total_abs = sum(stu_abs_days.values())
        total_tard = sum(stu_tardy_count.values())
        stu_with_abs = len(stu_abs_days)
        stu_with_tard = len(stu_tardy_count)
        n_stu = len(student_set)

        # Top 10 absentees (sorted by class, then days desc)
        sorted_abs = sorted(stu_abs_days.items(), key=lambda x: (class_name_map.get(student_class.get(x[0], ""), ""), -x[1]))[:10]
        top_absentees = [{
            "studentNumber": sn, "studentName": student_name_map.get(sn, sn),
            "days": d, "className": class_name_map.get(student_class.get(sn, ""), ""),
            "detail": _build_student_detail(sn, student_detail_map, student_grades_map,
                absenceByMonth=[{"month": m, "days": dy} for m, dy in stu_absence_monthly.get(sn, {}).items()],
                absenceReasons=[{"reason": r, "days": dy} for r, dy in stu_absence_reasons.get(sn, {}).items()],
            ),
        } for sn, d in sorted_abs]

        # Absence by class
        abs_by_class = []
        for cc in sorted(class_stu_set.keys(), key=lambda x: int(x) if x.isdigit() else 0):
            abs_by_class.append({
                "classCode": cc,
                "className": class_name_map.get(cc, cc),
                "students": len(class_stu_set[cc]),
                "absenceDays": class_abs_total.get(cc, 0),
                "tardyCount": class_tardy_total.get(cc, 0),
                "avgAbsence": round(class_abs_total.get(cc, 0) / len(class_stu_set[cc]), 1) if class_stu_set[cc] else 0,
            })

        # Tardy by class (separate view)
        tardy_by_class = []
        for cc in sorted(class_tardy_total.keys(), key=lambda x: int(x) if x.isdigit() else 0):
            cnt = class_tardy_total[cc]
            if cnt > 0:
                tardy_by_class.append({
                    "classCode": cc,
                    "className": class_name_map.get(cc, cc),
                    "count": cnt,
                })

        summary[filter_key]["attendance_detail"] = {
            "total_absence_days": total_abs,
            "total_tardy": total_tard,
            "students_with_absences": stu_with_abs,
            "students_with_tardy": stu_with_tard,
            "avg_absence_per_student": round(total_abs / n_stu, 1) if n_stu > 0 else 0,
            "avg_tardy_per_student": round(total_tard / n_stu, 1) if n_stu > 0 else 0,
            "top_absentees": top_absentees,
            "absence_by_class": abs_by_class,
            "tardy_by_class": tardy_by_class,
        }

    # ── Financial delinquency (for Financial Delinquency report) ──
    for filter_key, student_set in [("all", all_student_numbers),
                                     ("0021-01", major_students["0021-01"]),
                                     ("0021-02", major_students["0021-02"])]:
        stu_charges = defaultdict(lambda: {"charged": 0.0, "paid": 0.0, "discount": 0.0, "balance": 0.0})
        inst_balance = defaultdict(float)  # term → outstanding
        inst_charged = defaultdict(float)
        class_balance = defaultdict(float)
        class_charged = defaultdict(float)

        for ch in charges:
            sn = str(ch.Student_Number)
            if filter_key != "all" and sn not in student_set:
                continue
            amt = float(ch.charges)
            pd = float(ch.paid)
            disc = float(ch.discount)
            bal = float(ch.balance)
            stu_charges[sn]["charged"] += amt
            stu_charges[sn]["paid"] += pd
            stu_charges[sn]["discount"] += disc
            stu_charges[sn]["balance"] += bal

            term = charge_type_term_map.get(str(ch.Charge_Type_Code or ""), 0)
            inst_balance[term] += bal
            inst_charged[term] += amt

            cc = student_class.get(sn, "")
            if cc:
                class_balance[cc] += bal
                class_charged[cc] += amt

        total_charged = sum(s["charged"] for s in stu_charges.values())
        total_paid = sum(s["paid"] for s in stu_charges.values())
        total_disc = sum(s["discount"] for s in stu_charges.values())
        total_outstanding = sum(s["balance"] for s in stu_charges.values())
        fully_paid = sum(1 for s in stu_charges.values() if s["balance"] <= 0)
        with_balance = sum(1 for s in stu_charges.values() if s["balance"] > 0)
        zero_paid = sum(1 for s in stu_charges.values() if s["paid"] <= 0 and s["charged"] > 0)
        collection_rate = (total_paid / total_charged * 100) if total_charged > 0 else 0

        # Build student lists for fully-paid and zero-paid
        # These will be stored in separate Firestore docs to avoid 1MB limit
        fully_paid_students = []
        zero_paid_students = []
        for sn, d in stu_charges.items():
            if d["balance"] <= 0:
                fully_paid_students.append({
                    "studentNumber": sn,
                    "studentName": student_name_map.get(sn, sn),
                    "className": class_name_map.get(student_class.get(sn, ""), ""),
                    "charged": round(d["charged"], 2),
                    "paid": round(d["paid"], 2),
                    "balance": round(d["balance"], 2),
                    "majorCode": student_major.get(sn, ""),
                    "sectionCode": student_section_map.get(sn, ""),
                    "sectionName": student_detail_map.get(sn, {}).get("section", ""),
                    "familyNumber": student_family_map.get(sn, ""),
                    "familyName": family_name_map.get(student_family_map.get(sn, ""), ""),
                })
            if d["paid"] <= 0 and d["charged"] > 0:
                zero_paid_students.append({
                    "studentNumber": sn,
                    "studentName": student_name_map.get(sn, sn),
                    "className": class_name_map.get(student_class.get(sn, ""), ""),
                    "charged": round(d["charged"], 2),
                    "paid": round(d["paid"], 2),
                    "balance": round(d["balance"], 2),
                    "majorCode": student_major.get(sn, ""),
                    "sectionCode": student_section_map.get(sn, ""),
                    "sectionName": student_detail_map.get(sn, {}).get("section", ""),
                    "familyNumber": student_family_map.get(sn, ""),
                    "familyName": family_name_map.get(student_family_map.get(sn, ""), ""),
                })
        fully_paid_students.sort(key=lambda x: (x["className"], x["studentName"]))
        zero_paid_students.sort(key=lambda x: (x["className"], x["studentName"]))

        # Store student lists in a separate Firestore document
        if db_fs:
            delinquency_students_ref = db_fs.collection("delinquency_students").document(f"{year}_{filter_key}")
            delinquency_students_ref.set({
                "fully_paid_students": fully_paid_students,
                "zero_paid_students": zero_paid_students,
            })

        # Balance by installment
        labels = {1: "Installment 1", 2: "Installment 2", 3: "Installment 3", 0: "Other"}
        balance_by_inst = []
        for t in (1, 2, 3, 0):
            balance_by_inst.append({
                "term": t,
                "label": labels[t],
                "outstanding": round(inst_balance.get(t, 0), 2),
                "charged": round(inst_charged.get(t, 0), 2),
                "rate": round(((inst_charged.get(t, 0) - inst_balance.get(t, 0)) / inst_charged.get(t, 0) * 100) if inst_charged.get(t, 0) > 0 else 0, 1),
            })

        # Balance by class
        bal_by_class = []
        for cc in sorted(class_balance.keys(), key=lambda x: int(x) if x.isdigit() else 0):
            if class_balance[cc] > 0:
                bal_by_class.append({
                    "classCode": cc,
                    "className": class_name_map.get(cc, cc),
                    "outstanding": round(class_balance[cc], 2),
                    "charged": round(class_charged.get(cc, 0), 2),
                    "rate": round(((class_charged.get(cc, 0) - class_balance[cc]) / class_charged.get(cc, 0) * 100) if class_charged.get(cc, 0) > 0 else 0, 1),
                })

        # Top 10 delinquent students (sorted by class, then balance desc)
        sorted_del = sorted(stu_charges.items(), key=lambda x: (class_name_map.get(student_class.get(x[0], ""), ""), -x[1]["balance"]))
        top_del = []
        for sn, d in sorted_del[:10]:
            if d["balance"] <= 0:
                break
            top_del.append({
                "studentNumber": sn,
                "studentName": student_name_map.get(sn, sn),
                "charged": round(d["charged"], 2),
                "paid": round(d["paid"], 2),
                "balance": round(d["balance"], 2),
                "className": class_name_map.get(student_class.get(sn, ""), ""),
                "detail": _build_student_detail(sn, student_detail_map, student_grades_map,
                    balanceByTerm=[{"term": t, **v} for t, v in stu_charge_by_term.get(sn, {}).items()],
                ),
            })

        summary[filter_key]["delinquency"] = {
            "total_charged": round(total_charged, 2),
            "total_paid": round(total_paid, 2),
            "total_outstanding": round(total_outstanding, 2),
            "total_discount": round(total_disc, 2),
            "collection_rate": round(collection_rate, 1),
            "students_fully_paid": fully_paid,
            "students_with_balance": with_balance,
            "students_zero_paid": zero_paid,
            "balance_by_installment": balance_by_inst,
            "balance_by_class": bal_by_class,
            "top_delinquents": top_del,
        }

    # ── Subject Performance (heatmap + KPIs) ──
    # Uses Section_Avg to get per-subject averages (Exam_Code='11' = Total year)
    # Also uses Class_Avg for the class×subject heatmap
    cursor.execute("""
        SELECT sa.Subject_Code, s.E_Subject_Name, sa.Major_Code,
               AVG(sa.Section_Average) as avg_of_avgs,
               MIN(sa.Section_Average) as min_avg,
               MAX(sa.Section_Average) as max_avg,
               COUNT(*) as section_count
        FROM Section_Avg sa
        JOIN Subject s ON sa.Subject_Code = s.Subject_Code
        WHERE sa.Academic_Year = ? AND sa.Exam_Code = '11'
          AND sa.Subject_Code NOT IN ('800','900')
        GROUP BY sa.Subject_Code, s.E_Subject_Name, sa.Major_Code
        ORDER BY sa.Subject_Code
    """, year_val)
    subj_perf_rows = cursor.fetchall()

    # Fall back to Exam_Code='05' (First Semester) if no '11' data
    if not subj_perf_rows:
        cursor.execute("""
            SELECT sa.Subject_Code, s.E_Subject_Name, sa.Major_Code,
                   AVG(sa.Section_Average) as avg_of_avgs,
                   MIN(sa.Section_Average) as min_avg,
                   MAX(sa.Section_Average) as max_avg,
                   COUNT(*) as section_count
            FROM Section_Avg sa
            JOIN Subject s ON sa.Subject_Code = s.Subject_Code
            WHERE sa.Academic_Year = ? AND sa.Exam_Code = '05'
              AND sa.Subject_Code NOT IN ('800','900')
            GROUP BY sa.Subject_Code, s.E_Subject_Name, sa.Major_Code
            ORDER BY sa.Subject_Code
        """, year_val)
        subj_perf_rows = cursor.fetchall()

    for filter_key, student_set in [("all", all_student_numbers),
                                     ("0021-01", major_students["0021-01"]),
                                     ("0021-02", major_students["0021-02"])]:
        subj_map = {}
        for r in subj_perf_rows:
            mc = str(r.Major_Code or "")
            if filter_key != "all" and mc != filter_key:
                continue
            name = str(r.E_Subject_Name)
            if r.avg_of_avgs is None:
                continue
            if name not in subj_map:
                subj_map[name] = {"avg_sum": 0, "avg_cnt": 0, "min": 999, "max": 0, "sec_cnt": 0}
            subj_map[name]["avg_sum"] += float(r.avg_of_avgs) * int(r.section_count)
            subj_map[name]["avg_cnt"] += int(r.section_count)
            subj_map[name]["min"] = min(subj_map[name]["min"], float(r.min_avg or 0))
            subj_map[name]["max"] = max(subj_map[name]["max"], float(r.max_avg or 0))
            subj_map[name]["sec_cnt"] += int(r.section_count)

        subjects_list = []
        for name, d in sorted(subj_map.items(), key=lambda x: x[0]):
            avg = d["avg_sum"] / d["avg_cnt"] if d["avg_cnt"] > 0 else 0
            subjects_list.append({
                "name": name,
                "avg": round(avg, 1),
                "min": round(d["min"], 0),
                "max": round(d["max"], 0),
                "sectionCount": d["sec_cnt"],
            })

        strongest = max(subjects_list, key=lambda x: x["avg"])["name"] if subjects_list else ""
        weakest = min(subjects_list, key=lambda x: x["avg"])["name"] if subjects_list else ""

        summary[filter_key]["subject_performance"]["subjects"] = subjects_list
        summary[filter_key]["subject_performance"]["strongest_subject"] = strongest
        summary[filter_key]["subject_performance"]["weakest_subject"] = weakest

    # Subject × Class heatmap using Class_Avg
    exam_code_for_heatmap = '11'
    cursor.execute("""
        SELECT ca.Class_Code, cl.E_Class_Desc, ca.Subject_Code, s.E_Subject_Name,
               ca.Class_Average, ca.Major_Code
        FROM Class_Avg ca
        JOIN Subject s ON ca.Subject_Code = s.Subject_Code
        JOIN Class cl ON ca.Class_Code = cl.Class_Code
        WHERE ca.Academic_Year = ? AND ca.Exam_Code = ?
          AND ca.Subject_Code NOT IN ('800','900')
        ORDER BY ca.Class_Code, ca.Subject_Code
    """, year_val, exam_code_for_heatmap)
    heatmap_rows = cursor.fetchall()

    if not heatmap_rows:
        cursor.execute("""
            SELECT ca.Class_Code, cl.E_Class_Desc, ca.Subject_Code, s.E_Subject_Name,
                   ca.Class_Average, ca.Major_Code
            FROM Class_Avg ca
            JOIN Subject s ON ca.Subject_Code = s.Subject_Code
            JOIN Class cl ON ca.Class_Code = cl.Class_Code
            WHERE ca.Academic_Year = ? AND ca.Exam_Code = '05'
              AND ca.Subject_Code NOT IN ('800','900')
            ORDER BY ca.Class_Code, ca.Subject_Code
        """, year_val)
        heatmap_rows = cursor.fetchall()

    for filter_key in ("all", "0021-01", "0021-02"):
        class_subj = defaultdict(dict)  # className → {subjName: avg}
        for r in heatmap_rows:
            mc = str(r.Major_Code or "")
            if filter_key != "all" and mc != filter_key:
                continue
            cn = str(r.E_Class_Desc)
            sn = str(r.E_Subject_Name)
            avg = float(r.Class_Average or 0)
            # If multiple rows for same class+subject (duplicate major codes), average them
            if sn in class_subj[cn]:
                class_subj[cn][sn] = (class_subj[cn][sn] + avg) / 2
            else:
                class_subj[cn][sn] = avg

        heatmap = []
        for cn in sorted(class_subj.keys()):
            subjects = [{"name": sn, "avg": round(a, 1)} for sn, a in sorted(class_subj[cn].items())]
            heatmap.append({"className": cn, "subjects": subjects})

        summary[filter_key]["subject_performance"]["heatmap"] = heatmap

    # ── Term-by-Term Progress ──
    # Use Student_Exam_Results grouped by Exam_Code (semester totals: 05, 10, 14)
    cursor.execute("""
        SELECT ser.Exam_Code, e.E_Exam_Desc, ser.Student_Number,
               ser.Final_Average_Grade, ser.Student_Result
        FROM Student_Exam_Results ser
        JOIN Exams e ON ser.Exam_Code = e.Exam_Code
        WHERE ser.Academic_Year = ?
          AND ser.Exam_Code IN ('05','10','14')
        ORDER BY ser.Exam_Code
    """, year_val)
    term_rows = cursor.fetchall()

    # Build per-student exam trend: sn → [{"exam": name, "avg": float}]
    stu_exam_trend = defaultdict(list)
    _seen_trend = defaultdict(set)
    for r in term_rows:
        sn = str(r.Student_Number)
        ec = str(r.Exam_Code)
        if ec not in _seen_trend[sn]:
            _seen_trend[sn].add(ec)
            avg = float(r.Final_Average_Grade or 0)
            stu_exam_trend[sn].append({
                "exam": str(r.E_Exam_Desc or ec).strip(),
                "avg": round(avg, 1),
            })

    for filter_key, student_set in [("all", all_student_numbers),
                                     ("0021-01", major_students["0021-01"]),
                                     ("0021-02", major_students["0021-02"])]:
        term_data = defaultdict(lambda: {"name": "", "sum": 0, "cnt": 0, "pass": 0, "fail": 0})
        for r in term_rows:
            sn = str(r.Student_Number)
            if filter_key != "all" and sn not in student_set:
                continue
            ec = str(r.Exam_Code)
            term_data[ec]["name"] = str(r.E_Exam_Desc)
            term_data[ec]["sum"] += float(r.Final_Average_Grade or 0)
            term_data[ec]["cnt"] += 1
            if str(r.Student_Result or "").upper() == "P":
                term_data[ec]["pass"] += 1
            elif str(r.Student_Result or "").upper() == "F":
                term_data[ec]["fail"] += 1

        terms_result = []
        for ec in ("05", "10", "14"):
            if ec in term_data:
                d = term_data[ec]
                terms_result.append({
                    "termCode": ec,
                    "termName": d["name"],
                    "avgGrade": round(d["sum"] / d["cnt"], 1) if d["cnt"] > 0 else 0,
                    "passRate": round(d["pass"] / d["cnt"] * 100, 1) if d["cnt"] > 0 else 0,
                    "count": d["cnt"],
                })

        summary[filter_key]["term_progress"]["terms"] = terms_result

    # Term by subject — Section_Avg grouped by Exam_Code (use semester exams: 05,10,14)
    cursor.execute("""
        SELECT sa.Exam_Code, e.E_Exam_Desc, sa.Subject_Code, s.E_Subject_Name,
               AVG(sa.Section_Average) as avg, sa.Major_Code
        FROM Section_Avg sa
        JOIN Subject s ON sa.Subject_Code = s.Subject_Code
        JOIN Exams e ON sa.Exam_Code = e.Exam_Code
        WHERE sa.Academic_Year = ? AND sa.Exam_Code IN ('05','10','14')
          AND sa.Subject_Code NOT IN ('800','900')
        GROUP BY sa.Exam_Code, e.E_Exam_Desc, sa.Subject_Code, s.E_Subject_Name, sa.Major_Code
        ORDER BY sa.Subject_Code, sa.Exam_Code
    """, year_val)
    term_subj_rows = cursor.fetchall()

    for filter_key in ("all", "0021-01", "0021-02"):
        subj_terms = defaultdict(list)  # subject_name → [{term, avg}]
        seen = defaultdict(set)
        for r in term_subj_rows:
            mc = str(r.Major_Code or "")
            if filter_key != "all" and mc != filter_key:
                continue
            if r.avg is None:
                continue
            name = str(r.E_Subject_Name)
            ec = str(r.Exam_Code)
            if ec in seen[name]:
                continue
            seen[name].add(ec)
            subj_terms[name].append({
                "term": str(r.E_Exam_Desc),
                "avg": round(float(r.avg), 1),
            })

        result = [{"subject": name, "terms": terms} for name, terms in sorted(subj_terms.items())]
        summary[filter_key]["term_progress"]["term_by_subject"] = result

    # ── Subject Trends (multi-year) ──
    # For each subject, get avg across ALL years using Class_Avg (Exam 11=Total, fallback 05)
    cursor.execute("""
        SELECT ca.Academic_Year, ca.Subject_Code, s.E_Subject_Name,
               AVG(ca.Class_Average) as avg
        FROM Class_Avg ca
        JOIN Subject s ON ca.Subject_Code = s.Subject_Code
        WHERE ca.Exam_Code = '11'
          AND ca.Subject_Code NOT IN ('800','900')
        GROUP BY ca.Academic_Year, ca.Subject_Code, s.E_Subject_Name
        ORDER BY ca.Subject_Code, ca.Academic_Year
    """)
    trend_rows = cursor.fetchall()

    # Subject trends is the same for all filter_keys (Class_Avg doesn't have Major_Code in
    # a reliable way across years), so we compute once and assign to all
    subj_year_data = defaultdict(list)
    for r in trend_rows:
        if r.avg is None:
            continue
        name = str(r.E_Subject_Name)
        subj_year_data[name].append({
            "year": str(r.Academic_Year),
            "avg": round(float(r.avg), 1),
        })

    trends_result = [{"subject": name, "years": years}
                     for name, years in sorted(subj_year_data.items())]

    for filter_key in ("all", "0021-01", "0021-02"):
        summary[filter_key]["subject_trends"]["trends"] = trends_result

    # ── Honor Roll ──
    # Students with Final_Average_Grade >= 95 on the final exam (Exam 11 or best semester)
    # Use the "best" available comprehensive exam: 11 (Total), then 10 (Second Semester), then 05
    honor_exam = None
    for ec in ('11', '10', '05'):
        cursor.execute("""
            SELECT COUNT(*) FROM Student_Exam_Results
            WHERE Academic_Year = ? AND Exam_Code = ?
        """, year_val, ec)
        cnt = cursor.fetchone()[0]
        if cnt > 0:
            honor_exam = ec
            break

    if honor_exam:
        cursor.execute("""
            SELECT ser.Student_Number, ser.Final_Average_Grade,
                   ser.Class_Rank, ser.Section_Rank
            FROM Student_Exam_Results ser
            WHERE ser.Academic_Year = ? AND ser.Exam_Code = ?
            ORDER BY ser.Final_Average_Grade DESC
        """, year_val, honor_exam)
        honor_rows = cursor.fetchall()
    else:
        honor_rows = []

    # Build class average map from honor exam results (for comparison in detail dialogs)
    _class_avg_sum = defaultdict(float)
    _class_avg_cnt = defaultdict(int)
    for r in honor_rows:
        sn = str(r.Student_Number)
        cc = student_class.get(sn, "")
        if cc:
            _class_avg_sum[cc] += float(r.Final_Average_Grade or 0)
            _class_avg_cnt[cc] += 1
    class_avg_map = {cc: round(_class_avg_sum[cc] / _class_avg_cnt[cc], 1) for cc in _class_avg_cnt if _class_avg_cnt[cc] > 0}

    for filter_key, student_set in [("all", all_student_numbers),
                                     ("0021-01", major_students["0021-01"]),
                                     ("0021-02", major_students["0021-02"])]:
        honor_students = []
        total_students_exam = 0
        class_honor_cnt = defaultdict(int)
        class_total_cnt = defaultdict(int)

        for r in honor_rows:
            sn = str(r.Student_Number)
            if filter_key != "all" and sn not in student_set:
                continue
            total_students_exam += 1
            cc = student_class.get(sn, "")
            class_total_cnt[cc] += 1
            avg = float(r.Final_Average_Grade or 0)

            if avg >= 95:
                class_honor_cnt[cc] += 1
                honor_students.append({
                    "studentNumber": sn,
                    "studentName": student_name_map.get(sn, sn),
                    "avg": round(avg, 1),
                    "classRank": int(r.Class_Rank or 0),
                    "secRank": int(r.Section_Rank or 0),
                    "className": class_name_map.get(cc, cc),
                    "detail": _build_student_detail(sn, student_detail_map, student_grades_map,
                        examTrend=stu_exam_trend.get(sn, []),
                        classAvg=class_avg_map.get(cc, 0),
                    ),
                })

        total_honor = len(honor_students)
        honor_rate = round(total_honor / total_students_exam * 100, 1) if total_students_exam > 0 else 0

        # Top 20 honor students (sorted by class, then avg desc)
        top_honor = sorted(honor_students, key=lambda x: (x["className"], -x["avg"]))[:20]

        # Honor by class
        honor_by_class = []
        for cc in sorted(class_honor_cnt.keys(), key=lambda x: int(x) if x.isdigit() else 0):
            h_cnt = class_honor_cnt[cc]
            t_cnt = class_total_cnt[cc]
            honor_by_class.append({
                "classCode": cc,
                "className": class_name_map.get(cc, cc),
                "count": h_cnt,
                "total": t_cnt,
                "rate": round(h_cnt / t_cnt * 100, 1) if t_cnt > 0 else 0,
            })

        summary[filter_key]["honor_roll"] = {
            "total_honor": total_honor,
            "honor_rate": honor_rate,
            "top_students": top_honor,
            "honor_by_class": honor_by_class,
        }

    # ── At-Risk Students ──
    # Students with avg < 60 on the latest semester exam, cross-referenced with absences
    at_risk_exam = honor_exam  # use same exam

    for filter_key, student_set in [("all", all_student_numbers),
                                     ("0021-01", major_students["0021-01"]),
                                     ("0021-02", major_students["0021-02"])]:
        at_risk_students = []
        total_students_exam = 0
        class_risk_cnt = defaultdict(int)
        class_total_cnt = defaultdict(int)

        # Build per-student absence map
        stu_abs = defaultdict(int)
        for a in absences:
            sn = str(a.Student_Number)
            if filter_key != "all" and sn not in student_set:
                continue
            stu_abs[sn] += int(a.days)

        for r in honor_rows:
            sn = str(r.Student_Number)
            if filter_key != "all" and sn not in student_set:
                continue
            total_students_exam += 1
            cc = student_class.get(sn, "")
            class_total_cnt[cc] += 1
            avg = float(r.Final_Average_Grade or 0)

            if avg < 60:
                class_risk_cnt[cc] += 1
                at_risk_students.append({
                    "studentNumber": sn,
                    "studentName": student_name_map.get(sn, sn),
                    "avg": round(avg, 1),
                    "absenceDays": stu_abs.get(sn, 0),
                    "className": class_name_map.get(cc, cc),
                    "detail": _build_student_detail(sn, student_detail_map, student_grades_map,
                        failingSubjects=[{"subject": s, "grade": round(g, 1)} for s, g in student_grades_map.get(sn, {}).items() if g < 60],
                        examTrend=stu_exam_trend.get(sn, []),
                        classAvg=class_avg_map.get(cc, 0),
                        absenceByMonth=[{"month": m, "days": dy} for m, dy in stu_absence_monthly.get(sn, {}).items()],
                    ),
                })

        total_risk = len(at_risk_students)
        risk_rate = round(total_risk / total_students_exam * 100, 1) if total_students_exam > 0 else 0

        # Sort by class, then avg ascending (worst first), limit to 30
        at_risk_sorted = sorted(at_risk_students, key=lambda x: (x["className"], x["avg"]))[:30]

        # At-risk by class
        risk_by_class = []
        for cc in sorted(class_risk_cnt.keys(), key=lambda x: int(x) if x.isdigit() else 0):
            r_cnt = class_risk_cnt[cc]
            t_cnt = class_total_cnt[cc]
            risk_by_class.append({
                "classCode": cc,
                "className": class_name_map.get(cc, cc),
                "count": r_cnt,
                "total": t_cnt,
                "rate": round(r_cnt / t_cnt * 100, 1) if t_cnt > 0 else 0,
            })

        summary[filter_key]["at_risk"] = {
            "total_at_risk": total_risk,
            "at_risk_rate": risk_rate,
            "at_risk_students": at_risk_sorted,
            "at_risk_by_class": risk_by_class,
        }

    # ── Finalize class breakdown ──
    # Count unique students per class
    class_students_all = defaultdict(set)
    class_students_01 = defaultdict(set)
    class_students_02 = defaultdict(set)
    for sn, cc in student_class.items():
        if not cc:
            continue
        class_students_all[cc].add(sn)
        mc = student_major.get(sn, "")
        if mc == "0021-01":
            class_students_01[cc].add(sn)
        elif mc == "0021-02":
            class_students_02[cc].add(sn)

    for filter_key, cs_map in [("all", class_students_all),
                                ("0021-01", class_students_01),
                                ("0021-02", class_students_02)]:
        class_exams = summary[filter_key].pop("_class_exams", {})
        class_absences = summary[filter_key].pop("_class_absences", {})
        rows = []
        for cc in sorted(cs_map.keys(), key=lambda x: int(x) if x.isdigit() else 0):
            stu_count = len(cs_map[cc])
            if stu_count == 0:
                continue
            cx = class_exams.get(cc, {"total": 0, "sum": 0.0, "pass": 0})
            rows.append({
                "classCode": cc,
                "className": class_name_map.get(cc, cc),
                "students": stu_count,
                "avgGrade": round(cx["sum"] / cx["total"], 2) if cx["total"] > 0 else 0,
                "passRate": round(cx["pass"] / cx["total"] * 100, 2) if cx["total"] > 0 else 0,
                "absenceDays": class_absences.get(cc, 0),
            })
        summary[filter_key]["academics"]["class_breakdown"] = rows

    return summary


# ── Quiz / Assessment Grades Summary ────────────────────────────────
def build_quiz_summary_for_year(cursor, year, class_name_map):
    """Build a Firestore doc with tbl_Quiz_Grades aggregations split by school.

    Structure:  quiz_summaries/{year}
    {
      academic_year, updated_at,
      "all":      { exams, classes, sections, data },
      "0021-01":  { exams, classes, sections, data },   # Boys' School
      "0021-02":  { exams, classes, sections, data },   # Girls' School
    }
    """
    print("  Building quiz / assessment grades summary...")

    # Exam definitions
    cursor.execute("SELECT Exam_Code, E_Exam_Desc FROM Exams ORDER BY Exam_Code")
    exam_map = {}
    for r in cursor.fetchall():
        exam_map[str(r.Exam_Code)] = str(r.E_Exam_Desc or r.Exam_Code)

    # Subject name map (English)
    cursor.execute("SELECT Subject_Code, E_Subject_Name FROM Subject")
    subject_map = {}
    for r in cursor.fetchall():
        subject_map[str(r.Subject_Code)] = str(r.E_Subject_Name or r.Subject_Code)

    # Section name map for this year — keyed by (major, class, sec) for school-specific names
    cursor.execute("""
        SELECT Major_Code, Class_Code, Section_Code, E_Section_Name
        FROM Section
        WHERE Academic_Year = ?
    """, year)
    section_name_map = {}  # (class, sec) → name  (last wins — used for "all" slice)
    section_name_by_major = {}  # (major, class, sec) → name  (school-specific)
    for r in cursor.fetchall():
        major = str(r.Major_Code)
        cc = str(r.Class_Code)
        sc = str(r.Section_Code)
        name = str(r.E_Section_Name or sc).strip()
        section_name_map[(cc, sc)] = name
        section_name_by_major[(major, cc, sc)] = name

    # Fetch aggregated quiz grades — now including Major_Code
    cursor.execute("""
        SELECT Exam_Code, Major_Code, Class_Code, Section_Code, Subject_Code, Quiz_Code,
               COUNT(*) as total,
               SUM(CASE WHEN Grade IS NOT NULL THEN 1 ELSE 0 END) as graded,
               CAST(AVG(Grade) AS DECIMAL(5,1)) as avg_grade,
               CAST(MIN(Grade) AS DECIMAL(5,1)) as min_grade,
               CAST(MAX(Grade) AS DECIMAL(5,1)) as max_grade,
               COUNT(DISTINCT Student_Number) as students
        FROM tbl_Quiz_Grades
        WHERE Academic_Year = ?
        GROUP BY Exam_Code, Major_Code, Class_Code, Section_Code, Subject_Code, Quiz_Code
    """, year)
    raw_rows = cursor.fetchall()
    print(f"    Found {len(raw_rows):,} aggregation rows")

    if not raw_rows:
        return None  # no quiz data for this year

    # Discover school codes (Major_Code values)
    school_codes = set()
    for r in raw_rows:
        school_codes.add(str(r.Major_Code))

    # We'll build a full slice for "all" and each school code
    filter_keys = ["all"] + sorted(school_codes)

    # Helper to create empty accumulators
    def new_bucket():
        return {"subjects": defaultdict(lambda: {"total": 0, "graded": 0, "sum": 0.0,
                                                  "min": 999, "max": 0}),
                "quizzes": defaultdict(lambda: {"total": 0, "graded": 0, "sum": 0.0}),
                "total": 0, "graded": 0, "sum": 0.0}

    # Accumulators per filter: [filter_key][exam][class][section] → bucket
    acc = {}
    exam_sets = {}
    class_sets = {}
    section_dicts = {}
    for fk in filter_keys:
        acc[fk] = defaultdict(lambda: defaultdict(lambda: defaultdict(new_bucket)))
        exam_sets[fk] = set()
        class_sets[fk] = set()
        section_dicts[fk] = defaultdict(set)

    for r in raw_rows:
        ec = str(r.Exam_Code)
        mc = str(r.Major_Code)
        cc = str(r.Class_Code)
        sc = str(r.Section_Code)
        subj = str(r.Subject_Code)
        qc = str(r.Quiz_Code)
        total = int(r.total)
        graded = int(r.graded)
        avg = float(r.avg_grade) if r.avg_grade else 0
        mn = float(r.min_grade) if r.min_grade else 0
        mx = float(r.max_grade) if r.max_grade else 0

        # Feed into both "all" and the specific school filter
        for fk in ["all", mc]:
            exam_sets[fk].add(ec)
            class_sets[fk].add(cc)
            section_dicts[fk][cc].add(sc)

            bucket = acc[fk][ec][cc][sc]
            bucket["total"] += total
            bucket["graded"] += graded
            bucket["sum"] += avg * graded if graded else 0

            sub = bucket["subjects"][subj]
            sub["total"] += total
            sub["graded"] += graded
            sub["sum"] += avg * graded if graded else 0
            if mn and mn < sub["min"]:
                sub["min"] = mn
            if mx > sub["max"]:
                sub["max"] = mx

            quiz = bucket["quizzes"][qc]
            quiz["total"] += total
            quiz["graded"] += graded
            quiz["sum"] += avg * graded if graded else 0

    # ── Helper functions ──
    def subject_list(subj_acc):
        items = []
        for code, s in sorted(subj_acc.items(), key=lambda x: (x[1]["sum"] / x[1]["graded"]) if x[1]["graded"] else 999):
            items.append({
                "code": code,
                "name": subject_map.get(code, code),
                "records": s["total"],
                "graded": s["graded"],
                "avg": round(s["sum"] / s["graded"], 1) if s["graded"] else 0,
                "min": s["min"] if s["min"] < 999 else 0,
                "max": s["max"],
            })
        return items

    def quiz_list(quiz_acc):
        items = []
        for code, q in sorted(quiz_acc.items()):
            items.append({
                "code": code,
                "records": q["total"],
                "graded": q["graded"],
                "avg": round(q["sum"] / q["graded"], 1) if q["graded"] else 0,
            })
        return items

    # ── Build output for each filter key ──
    result = {
        "academic_year": str(year),
        "updated_at": datetime.now(tz=None).isoformat(),
    }

    for fk in filter_keys:
        major_filter = None if fk == "all" else fk
        data = {}
        for ec in sorted(exam_sets[fk]):
            exam_data = {"overall": {"records": 0, "graded": 0, "avg": 0, "students": 0,
                                      "bySubject": [], "byQuiz": []},
                         "byClass": {}}
            overall_subj = defaultdict(lambda: {"total": 0, "graded": 0, "sum": 0.0, "min": 999, "max": 0})
            overall_quiz = defaultdict(lambda: {"total": 0, "graded": 0, "sum": 0.0})
            overall_total = 0
            overall_graded = 0
            overall_sum = 0.0

            for cc in sorted(acc[fk][ec].keys()):
                class_total = 0
                class_graded = 0
                class_sum = 0.0
                class_subj = defaultdict(lambda: {"total": 0, "graded": 0, "sum": 0.0, "min": 999, "max": 0})
                by_section = {}

                for sc in sorted(acc[fk][ec][cc].keys()):
                    b = acc[fk][ec][cc][sc]
                    sec_total = b["total"]
                    sec_graded = b["graded"]
                    sec_avg = round(b["sum"] / sec_graded, 1) if sec_graded else 0

                    # Count unique students per section
                    if major_filter:
                        cursor.execute("""
                            SELECT COUNT(DISTINCT Student_Number) as cnt
                            FROM tbl_Quiz_Grades
                            WHERE Academic_Year = ? AND Exam_Code = ? AND Class_Code = ?
                                  AND Section_Code = ? AND Major_Code = ?
                        """, year, ec, cc, sc, major_filter)
                    else:
                        cursor.execute("""
                            SELECT COUNT(DISTINCT Student_Number) as cnt
                            FROM tbl_Quiz_Grades
                            WHERE Academic_Year = ? AND Exam_Code = ? AND Class_Code = ?
                                  AND Section_Code = ?
                        """, year, ec, cc, sc)
                    sec_students = cursor.fetchone().cnt

                    sec_subj_list = subject_list(b["subjects"])
                    # Use school-specific section name when available
                    sec_name = (section_name_by_major.get((major_filter, cc, sc), None)
                                if major_filter else None) or section_name_map.get((cc, sc), sc)

                    by_section[sc] = {
                        "sectionName": sec_name,
                        "records": sec_total,
                        "graded": sec_graded,
                        "avg": sec_avg,
                        "students": sec_students,
                        "bySubject": sec_subj_list,
                    }

                    class_total += sec_total
                    class_graded += sec_graded
                    class_sum += b["sum"]

                    for subj, s in b["subjects"].items():
                        cs = class_subj[subj]
                        cs["total"] += s["total"]
                        cs["graded"] += s["graded"]
                        cs["sum"] += s["sum"]
                        if s["min"] < cs["min"]:
                            cs["min"] = s["min"]
                        if s["max"] > cs["max"]:
                            cs["max"] = s["max"]

                    for qc, q in b["quizzes"].items():
                        oq = overall_quiz[qc]
                        oq["total"] += q["total"]
                        oq["graded"] += q["graded"]
                        oq["sum"] += q["sum"]

                # Count unique students per class
                if major_filter:
                    cursor.execute("""
                        SELECT COUNT(DISTINCT Student_Number) as cnt
                        FROM tbl_Quiz_Grades
                        WHERE Academic_Year = ? AND Exam_Code = ? AND Class_Code = ? AND Major_Code = ?
                    """, year, ec, cc, major_filter)
                else:
                    cursor.execute("""
                        SELECT COUNT(DISTINCT Student_Number) as cnt
                        FROM tbl_Quiz_Grades
                        WHERE Academic_Year = ? AND Exam_Code = ? AND Class_Code = ?
                    """, year, ec, cc)
                class_stu_count = cursor.fetchone().cnt

                class_avg = round(class_sum / class_graded, 1) if class_graded else 0
                exam_data["byClass"][cc] = {
                    "className": class_name_map.get(cc, cc),
                    "records": class_total,
                    "graded": class_graded,
                    "avg": class_avg,
                    "students": class_stu_count,
                    "bySubject": subject_list(class_subj),
                    "bySection": by_section,
                }

                overall_total += class_total
                overall_graded += class_graded
                overall_sum += class_sum
                for subj, s in class_subj.items():
                    os = overall_subj[subj]
                    os["total"] += s["total"]
                    os["graded"] += s["graded"]
                    os["sum"] += s["sum"]
                    if s["min"] < os["min"]:
                        os["min"] = s["min"]
                    if s["max"] > os["max"]:
                        os["max"] = s["max"]

            # Build overall
            exam_data["overall"]["records"] = overall_total
            exam_data["overall"]["graded"] = overall_graded
            exam_data["overall"]["avg"] = round(overall_sum / overall_graded, 1) if overall_graded else 0
            if major_filter:
                cursor.execute("""
                    SELECT COUNT(DISTINCT Student_Number) as cnt
                    FROM tbl_Quiz_Grades
                    WHERE Academic_Year = ? AND Exam_Code = ? AND Major_Code = ?
                """, year, ec, major_filter)
            else:
                cursor.execute("""
                    SELECT COUNT(DISTINCT Student_Number) as cnt
                    FROM tbl_Quiz_Grades
                    WHERE Academic_Year = ? AND Exam_Code = ?
                """, year, ec)
            exam_data["overall"]["students"] = cursor.fetchone().cnt
            exam_data["overall"]["bySubject"] = subject_list(overall_subj)
            exam_data["overall"]["byQuiz"] = quiz_list(overall_quiz)

            data[ec] = exam_data

        # Build metadata lists for this filter
        exams_list = []
        for ec in sorted(exam_sets[fk]):
            d = data[ec]["overall"]
            exams_list.append({
                "examCode": ec,
                "examName": exam_map.get(ec, f"Exam {ec}"),
                "records": d["records"],
                "graded": d["graded"],
                "avg": d["avg"],
            })

        classes_list = []
        for cc in sorted(class_sets[fk]):
            classes_list.append({
                "classCode": cc,
                "className": class_name_map.get(cc, cc),
            })

        sections_out = {}
        for cc in sorted(section_dicts[fk].keys()):
            secs = []
            for sc in sorted(section_dicts[fk][cc]):
                # Use school-specific name when fk is a school code
                sec_name = (section_name_by_major.get((fk, cc, sc), None)
                            if fk != "all" else None) or section_name_map.get((cc, sc), sc)
                secs.append({
                    "sectionCode": sc,
                    "sectionName": sec_name,
                })
            sections_out[cc] = secs

        result[fk] = {
            "exams": exams_list,
            "classes": classes_list,
            "sections": sections_out,
            "data": data,
        }

    all_exams = len(result.get("all", {}).get("exams", []))
    all_classes = len(result.get("all", {}).get("classes", []))
    print(f"    Quiz summary: {all_exams} exams, {all_classes} classes, {len(filter_keys)} school slices")
    return result


def main():
    target_year = sys.argv[1] if len(sys.argv) > 1 else None

    # ── Connect SQL Server ──
    print("Connecting to SQL Server...")
    try:
        conn = connect_sql()
        print("  Connected via db_config (live SQL Server)")
    except Exception:
        print("  db_config failed, falling back to localhost\\SQLEXPRESS")
        conn = pyodbc.connect(
            f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={SERVER};"
            f"DATABASE={TEMP_DB};Trusted_Connection=yes",
            autocommit=True,
        )
    cursor = conn.cursor()

    # ── Init Firebase ──
    print("Connecting to Firebase...")
    if not firebase_admin._apps:
        cred = credentials.Certificate(KEY_PATH)
        firebase_admin.initialize_app(cred)
    db_fs = firestore.client()

    # ── Load reference data ──
    # Academic years
    cursor.execute("SELECT DISTINCT Academic_Year FROM Registration ORDER BY Academic_Year")
    all_years = [str(r.Academic_Year) for r in cursor.fetchall()]
    print(f"Found {len(all_years)} academic years: {', '.join(all_years)}")

    # Charge type → term mapping
    cursor.execute("SELECT Charge_Type_Code, E_Charge_Type_Desc, A_Charge_Type_Desc FROM Charge_Type")
    charge_type_term_map = {}
    for r in cursor.fetchall():
        code = str(r.Charge_Type_Code)
        desc = f"{r.E_Charge_Type_Desc or ''} {r.A_Charge_Type_Desc or ''}"
        charge_type_term_map[code] = parse_term(desc)

    # Nationality code → name
    cursor.execute("SELECT Nationality_Code, E_Nationality_Name FROM Nationality")
    nationality_map = {}
    for r in cursor.fetchall():
        nationality_map[str(r.Nationality_Code)] = str(r.E_Nationality_Name or r.Nationality_Code)

    # Class code → name
    cursor.execute("SELECT Class_Code, E_Class_Desc FROM Class")
    class_name_map = {}
    for r in cursor.fetchall():
        class_name_map[str(r.Class_Code)] = str(r.E_Class_Desc or r.Class_Code)

    # ── Generate summaries ──
    years_to_process = [target_year] if target_year else all_years

    for year in years_to_process:
        print(f"\n{'='*60}")
        print(f"Generating summary for {year}...")
        print(f"{'='*60}")

        summary = build_summary_for_year(
            cursor, year, all_years,
            charge_type_term_map, nationality_map, class_name_map, db_fs
        )

        # Write to Firestore
        doc_ref = db_fs.collection("summaries").document(str(year))
        doc_ref.set(summary)

        # ── Quiz / Assessment Grades Summary ──
        quiz_summary = build_quiz_summary_for_year(cursor, year, class_name_map)
        if quiz_summary:
            qs_ref = db_fs.collection("quiz_summaries").document(str(year))
            qs_ref.set(quiz_summary)
            print(f"  ✓ Quiz Summaries written to Firestore: quiz_summaries/{year}")
        else:
            print(f"  ⚠ No quiz grade data for {year}")

        s = summary["all"]
        print(f"  ✓ Students: {s['total_students']:,}")
        print(f"  ✓ Active Registrations: {s['active_registrations']:,}")
        print(f"  ✓ Total Exams: {s['academics']['total_exams']:,}")
        print(f"  ✓ Pass Rate: {s['academics']['pass_rate']:.1f}%")
        print(f"  ✓ Absence Days: {s['academics']['total_absence_days']:,}")
        print(f"  ✓ Tardies: {s['academics']['total_tardy']:,}")
        fin = s["financials"]["installments"]
        total_charges = sum(i["totalCharges"] for i in fin)
        total_paid = sum(i["totalPaid"] for i in fin)
        print(f"  ✓ Total Charges: SAR {total_charges:,.0f}")
        print(f"  ✓ Total Paid: SAR {total_paid:,.0f}")
        subj_cnt = len(s['subject_performance']['subjects'])
        print(f"  ✓ Subject Performance: {subj_cnt} subjects, strongest={s['subject_performance']['strongest_subject']}, weakest={s['subject_performance']['weakest_subject']}")
        print(f"  ✓ Term Progress: {len(s['term_progress']['terms'])} terms")
        print(f"  ✓ Subject Trends: {len(s['subject_trends']['trends'])} subjects tracked")
        print(f"  ✓ Honor Roll: {s['honor_roll']['total_honor']} students ({s['honor_roll']['honor_rate']}%)")
        print(f"  ✓ At Risk: {s['at_risk']['total_at_risk']} students ({s['at_risk']['at_risk_rate']}%)")
        print(f"  ✓ Written to Firestore: summaries/{year}")

    cursor.close()
    conn.close()
    print(f"\n✓ Done! Generated {len(years_to_process)} summary document(s).")


if __name__ == "__main__":
    main()

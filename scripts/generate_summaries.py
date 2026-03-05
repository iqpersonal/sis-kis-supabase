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
    }


def build_summary_for_year(cursor, year, all_years, charge_type_term_map,
                           nationality_map, class_name_map):
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
        SELECT Student_Number, Absence_Date, ISNULL(No_of_Days, 1) as days
        FROM Student_Absence
        WHERE Academic_Year = ?
    """, year_val)
    absences = cursor.fetchall()

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


def main():
    target_year = sys.argv[1] if len(sys.argv) > 1 else None

    # ── Connect SQL Server ──
    print("Connecting to SQL Server...")
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
            charge_type_term_map, nationality_map, class_name_map
        )

        # Write to Firestore
        doc_ref = db_fs.collection("summaries").document(str(year))
        doc_ref.set(summary)

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
        print(f"  ✓ Written to Firestore: summaries/{year}")

    cursor.close()
    conn.close()
    print(f"\n✓ Done! Generated {len(years_to_process)} summary document(s).")


if __name__ == "__main__":
    main()

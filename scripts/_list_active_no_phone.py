"""
List families of CURRENTLY REGISTERED students (25-26 or 26-27) who have no phone number.
Cross-references SQL Registration + Family tables, then checks Firestore.
"""
import pyodbc
import firebase_admin
from firebase_admin import credentials, firestore

SERVER = r"localhost\SQLEXPRESS"
DB = "_bak_import_temp"
conn = pyodbc.connect(
    f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={SERVER};DATABASE={DB};Trusted_Connection=yes",
    timeout=10,
)
cur = conn.cursor()

if not firebase_admin._apps:
    cred = credentials.Certificate("dashboard/serviceAccountKey.json")
    firebase_admin.initialize_app(cred)
db = firestore.client()

# --- Get all families with currently registered students ---
CURRENT_YEARS = ("25-26", "26-27")
placeholders = ",".join(["?" for _ in CURRENT_YEARS])

cur.execute(f"""
    SELECT DISTINCT
        r.Student_Number,
        s.Family_Number,
        fc.E_Child_Name,
        f.E_Family_Name,
        r.Academic_Year,
        r.Class_Code,
        r.Section_Code,
        f.E_Father_Name,
        f.Father_phone,
        f.Mother_phone,
        f.Family_Phone,
        f.Father_Work_Phone,
        f.Father_Email,
        f.Mother_Email
    FROM Registration r
    JOIN Student s ON r.Student_Number = s.Student_Number
    LEFT JOIN Family f ON s.Family_Number = f.Family_Number
    LEFT JOIN Family_Children fc ON s.Family_Number = fc.Family_Number AND s.Child_Number = fc.Child_Number
    WHERE r.Academic_Year IN ({placeholders})
    ORDER BY s.Family_Number, r.Student_Number
""", CURRENT_YEARS)

rows = cur.fetchall()
print(f"Total registered students in {CURRENT_YEARS}: {len(rows)}")

# Group by family
from collections import defaultdict
families = defaultdict(lambda: {
    "father_name": "", "family_name": "",
    "father_phone": "", "mother_phone": "", "family_phone": "", "father_work_phone": "",
    "father_email": "", "mother_email": "",
    "students": []
})

for r in rows:
    fn = str(r.Family_Number or "").strip()
    if not fn:
        continue
    fam = families[fn]
    fam["father_name"] = str(r.E_Father_Name or "").strip()
    fam["family_name"] = str(r.E_Family_Name or "").strip()
    fam["father_phone"] = str(r.Father_phone or "").strip()
    fam["mother_phone"] = str(r.Mother_phone or "").strip()
    fam["family_phone"] = str(r.Family_Phone or "").strip()
    fam["father_work_phone"] = str(r.Father_Work_Phone or "").strip()
    fam["father_email"] = str(r.Father_Email or "").strip()
    fam["mother_email"] = str(r.Mother_Email or "").strip()
    sn = str(r.Student_Number).strip()
    child_name = str(r.E_Child_Name or "").strip()
    family_name = str(r.E_Family_Name or "").strip()
    name = f"{child_name} {family_name}".strip() if child_name else family_name
    yr = str(r.Academic_Year).strip()
    cls = str(r.Class_Code or "").strip()
    sec = str(r.Section_Code or "").strip()
    fam["students"].append({"sn": sn, "name": name, "year": yr, "class": cls, "section": sec})

print(f"Total active families: {len(families)}")

# --- Separate: with phone vs without phone ---
has_any_phone = {}
no_phone = {}

for fn, fam in families.items():
    fp = fam["father_phone"]
    mp = fam["mother_phone"]
    famp = fam["family_phone"]
    fwp = fam["father_work_phone"]
    if fp or mp or famp or fwp:
        has_any_phone[fn] = fam
    else:
        no_phone[fn] = fam

print(f"\n{'='*80}")
print(f"SUMMARY (Registered Students Only)")
print(f"{'='*80}")
print(f"  Active families:                 {len(families)}")
print(f"  Families WITH father/mother phone: {len(has_any_phone)} ({100*len(has_any_phone)//len(families)}%)")
print(f"  Families WITHOUT any phone:        {len(no_phone)} ({100*len(no_phone)//len(families)}%)")

# Count specific phone types among those with phones
fp_cnt = sum(1 for f in families.values() if f["father_phone"])
mp_cnt = sum(1 for f in families.values() if f["mother_phone"])
print(f"  Has Father_phone:                {fp_cnt}")
print(f"  Has Mother_phone:                {mp_cnt}")

# --- Cross-check with Firestore ---
print(f"\n{'='*80}")
print(f"FIRESTORE CROSS-CHECK")
print(f"{'='*80}")

fs_match = 0
fs_mismatch = 0
fs_missing = 0
sample_mismatches = []

for fn, fam in list(has_any_phone.items())[:50]:  # Check 50 families
    doc = db.collection("families").document(fn).get()
    if doc.exists:
        d = doc.to_dict()
        fs_fp = (d.get("father_phone") or "").strip()
        if fs_fp == fam["father_phone"]:
            fs_match += 1
        else:
            fs_mismatch += 1
            if len(sample_mismatches) < 5:
                sample_mismatches.append((fn, fam["father_phone"], fs_fp))
    else:
        fs_missing += 1

print(f"  Checked 50 families with SQL phone data:")
print(f"    Match:    {fs_match}")
print(f"    Mismatch: {fs_mismatch}")
print(f"    Missing:  {fs_missing} (not in Firestore)")

if sample_mismatches:
    print(f"\n  Sample mismatches:")
    for fn, sql_v, fs_v in sample_mismatches:
        print(f"    {fn}: SQL=[{sql_v}] vs Firestore=[{fs_v}]")

# --- Full list of families without phone ---
print(f"\n{'='*80}")
print(f"ALL ACTIVE FAMILIES WITHOUT ANY PHONE NUMBER ({len(no_phone)} families)")
print(f"{'='*80}")
print(f"{'#':<4} {'Family #':<14} {'Father Name':<24} {'Family Name':<18} {'Students':<6} {'Student Names'}")
print("-" * 120)

sorted_no_phone = sorted(no_phone.items(), key=lambda x: x[0])
for i, (fn, fam) in enumerate(sorted_no_phone, 1):
    student_names = ", ".join(s["name"] for s in fam["students"][:3])
    if len(fam["students"]) > 3:
        student_names += f" (+{len(fam['students'])-3} more)"
    print(f"{i:<4} {fn:<14} {fam['father_name']:<24} {fam['family_name']:<18} {len(fam['students']):<6} {student_names}")

conn.close()

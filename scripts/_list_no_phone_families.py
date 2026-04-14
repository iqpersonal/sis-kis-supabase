"""
Cross-verify SQL vs Firestore phone data, then list all families without phone numbers.
"""
import pyodbc
import firebase_admin
from firebase_admin import credentials, firestore

# SQL
SERVER = r"localhost\SQLEXPRESS"
DB = "_bak_import_temp"
conn = pyodbc.connect(
    f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={SERVER};DATABASE={DB};Trusted_Connection=yes",
    timeout=10,
)
cur = conn.cursor()

# Firestore
if not firebase_admin._apps:
    cred = credentials.Certificate("dashboard/serviceAccountKey.json")
    firebase_admin.initialize_app(cred)
db = firestore.client()

# --- Step 1: Cross-verify a few families ---
print("=" * 70)
print("CROSS-VERIFICATION: SQL vs Firestore")
print("=" * 70)

# Get 10 families from SQL that HAVE Father_phone
cur.execute("""
    SELECT TOP 10 Family_Number, Father_phone, Mother_phone
    FROM Family
    WHERE Father_phone IS NOT NULL AND LTRIM(RTRIM(Father_phone)) != ''
      AND Family_UserName IS NOT NULL
    ORDER BY Family_Number
""")
sql_with_phone = [(str(r[0]).strip(), str(r[1] or "").strip(), str(r[2] or "").strip()) for r in cur.fetchall()]

mismatches = 0
for fn, sql_fp, sql_mp in sql_with_phone:
    doc = db.collection("families").document(fn).get()
    if doc.exists:
        d = doc.to_dict()
        fs_fp = (d.get("father_phone") or "").strip()
        fs_mp = (d.get("mother_phone") or "").strip()
        match = "OK" if fs_fp == sql_fp and fs_mp == sql_mp else "MISMATCH"
        if match == "MISMATCH":
            mismatches += 1
            print(f"  {fn}: SQL=({sql_fp}, {sql_mp}) vs Firestore=({fs_fp}, {fs_mp}) → {match}")
    else:
        print(f"  {fn}: NOT in Firestore (no enrolled children?)")

if mismatches == 0:
    print("  ✓ All sampled families match SQL ↔ Firestore")

# --- Step 2: Count families in SQL with phone but NOT in Firestore ---
cur.execute("""
    SELECT COUNT(*) FROM Family
    WHERE Father_phone IS NOT NULL AND LTRIM(RTRIM(Father_phone)) != ''
      AND Family_UserName IS NOT NULL AND Family_Password IS NOT NULL
""")
sql_with_creds_and_phone = cur.fetchone()[0]

cur.execute("""
    SELECT COUNT(*) FROM Family
    WHERE (Father_phone IS NULL OR LTRIM(RTRIM(Father_phone)) = '')
      AND Family_UserName IS NOT NULL AND Family_Password IS NOT NULL
""")
sql_with_creds_no_phone = cur.fetchone()[0]

print(f"\n  SQL families with credentials + Father_phone: {sql_with_creds_and_phone}")
print(f"  SQL families with credentials, NO Father_phone: {sql_with_creds_no_phone}")

# --- Step 3: Full list of Firestore families without phone ---
print("\n" + "=" * 70)
print("ALL FAMILIES WITHOUT ANY PHONE NUMBER")
print("=" * 70)

no_phone_families = []
for doc in db.collection("families").stream():
    d = doc.to_dict()
    fp = (d.get("father_phone") or "").strip()
    mp = (d.get("mother_phone") or "").strip()
    if not fp and not mp:
        fn = d.get("family_number", doc.id)
        fname = d.get("father_name", "")
        lname = d.get("family_name", "")
        children = d.get("children", [])
        child_names = [c.get("child_name", "") for c in children[:3]]
        no_phone_families.append({
            "family_number": fn,
            "father_name": fname,
            "family_name": lname,
            "children_count": len(children),
            "children_sample": ", ".join(child_names),
        })

no_phone_families.sort(key=lambda x: x["family_number"])

print(f"\nTotal families without phone: {len(no_phone_families)}")
print(f"{'Family #':<15} {'Father Name':<25} {'Family Name':<20} {'Children':<8} {'Student Names'}")
print("-" * 120)
for f in no_phone_families:
    print(f"{f['family_number']:<15} {f['father_name']:<25} {f['family_name']:<20} {f['children_count']:<8} {f['children_sample']}")

conn.close()

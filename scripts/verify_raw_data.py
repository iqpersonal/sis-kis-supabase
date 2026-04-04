"""Verify that raw data is now stored in Firestore student_progress docs."""
import json
import os
import firebase_admin
from firebase_admin import credentials, firestore

KEY_PATH = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")

if not firebase_admin._apps:
    cred = credentials.Certificate(KEY_PATH)
    firebase_admin.initialize_app(cred)
db = firestore.client()

# Pick a known student (Abdalla Hamada) to verify
# Also check a random student
print("=" * 70)
print("VERIFYING RAW DATA IN FIRESTORE")
print("=" * 70)

# Get one doc to check structure
docs = db.collection("student_progress").limit(1).stream()
for doc in docs:
    d = doc.to_dict()
    sn = d.get("student_number", "?")
    name = d.get("student_name", "?")
    print(f"\nSample: {name} ({sn})")
    print(f"  Top-level keys: {sorted(d.keys())}")

    # Check raw sub-objects
    for key in ["raw_student", "raw_family_child", "raw_family", "raw_registrations", "raw_prev_school", "raw_sponsors"]:
        raw = d.get(key)
        if raw is None:
            print(f"  {key}: MISSING!")
        elif isinstance(raw, dict):
            if key in ("raw_registrations", "raw_sponsors"):
                years = list(raw.keys())
                if years:
                    first_yr = raw[years[0]]
                    cols = len(first_yr) if isinstance(first_yr, dict) else 0
                    print(f"  {key}: {len(years)} years, {cols} columns each")
                else:
                    print(f"  {key}: empty dict")
            else:
                print(f"  {key}: {len(raw)} columns → {list(raw.keys())[:10]}...")
        else:
            print(f"  {key}: type={type(raw)}")

# Check a few specific fields in raw data
print("\n" + "-" * 70)
print("CHECKING SPECIFIC RAW FIELDS")
print("-" * 70)

# Check 3 students
test_students = []
query = db.collection("student_progress").limit(3).stream()
for doc in query:
    test_students.append(doc.to_dict())

for d in test_students:
    name = d.get("student_name", "?")
    sn = d.get("student_number", "?")
    raw_s = d.get("raw_student", {})
    raw_f = d.get("raw_family", {})
    raw_fc = d.get("raw_family_child", {})

    print(f"\n{name} ({sn}):")
    print(f"  raw_student.Password: {raw_s.get('Password', 'N/A')}")
    print(f"  raw_student.Email: {raw_s.get('Email', 'N/A')}")
    print(f"  raw_student.Enrollment_Date: {raw_s.get('Enrollment_Date', 'N/A')}")
    print(f"  raw_family.Father_phone: {raw_f.get('Father_phone', 'N/A')}")
    print(f"  raw_family.Mother_phone: {raw_f.get('Mother_phone', 'N/A')}")
    print(f"  raw_family.E_Family_Address: {raw_f.get('E_Family_Address', 'N/A')}")
    print(f"  raw_family.ID_Number (father iqama): {raw_f.get('ID_Number', 'N/A')}")
    print(f"  raw_family_child.Nationality_Code_Primary: {raw_fc.get('Nationality_Code_Primary', 'N/A')}")
    print(f"  raw_family_child.Child_Birth_Date: {raw_fc.get('Child_Birth_Date', 'N/A')}")
    print(f"  Curated passport_id: {d.get('passport_id', 'N/A')}")
    print(f"  Curated iqama_number: {d.get('iqama_number', 'N/A')}")

# Count docs with raw data
print("\n" + "-" * 70)
print("RAW DATA COVERAGE")
print("-" * 70)
has_raw = 0
missing_raw = 0
total = 0
for doc in db.collection("student_progress").stream():
    d = doc.to_dict()
    total += 1
    if d.get("raw_student"):
        has_raw += 1
    else:
        missing_raw += 1
    if total >= 100:  # Just sample 100
        break

print(f"  Sampled {total} docs: {has_raw} have raw_student, {missing_raw} missing")
if has_raw == total:
    print("  ✓ All sampled docs have raw data!")
else:
    print(f"  ⚠ {missing_raw} docs missing raw data")

print("\n✓ Verification complete")

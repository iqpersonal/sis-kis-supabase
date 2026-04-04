"""Check iqama data for Al Walid Saleh."""
import os
import firebase_admin
from firebase_admin import credentials, firestore

KEY_PATH = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")
if not firebase_admin._apps:
    cred = credentials.Certificate(KEY_PATH)
    firebase_admin.initialize_app(cred)
db = firestore.client()

# Search for this student
print("Searching for 'Walid' or 'Saleh'...")
count = 0
for doc in db.collection("student_progress").stream():
    d = doc.to_dict()
    name = d.get("student_name", "")
    if "Walid" in name or "Saleh" in name:
        sn = d.get("student_number", "")
        print(f"\n=== {name} ({sn}) ===")
        print(f"  passport_id: '{d.get('passport_id', '')}'")
        print(f"  iqama_number: '{d.get('iqama_number', '')}'")
        
        # Check raw data for any ID fields
        raw_s = d.get("raw_student", {})
        raw_f = d.get("raw_family", {})
        raw_fc = d.get("raw_family_child", {})
        
        print(f"  raw_student.Password: {raw_s.get('Password', 'N/A')}")
        print(f"  raw_student.Student_Number: {raw_s.get('Student_Number', 'N/A')}")
        print(f"  raw_student.MOE_Student_Number: {raw_s.get('MOE_Student_Number', 'N/A')}")
        print(f"  raw_student.SIF_Student_Number: {raw_s.get('SIF_Student_Number', 'N/A')}")
        print(f"  raw_student.Ministry_Student_Number: {raw_s.get('Ministry_Student_Number', 'N/A')}")
        print(f"  raw_family.ID_Number (father iqama): {raw_f.get('ID_Number', 'N/A')}")
        print(f"  raw_family.FatherId: {raw_f.get('FatherId', 'N/A')}")
        print(f"  raw_family.MotherId: {raw_f.get('MotherId', 'N/A')}")
        print(f"  raw_family_child.Child_id: {raw_fc.get('Child_id', 'N/A')}")
        count += 1

# Also check overall iqama stats
print(f"\n\n--- Found {count} matching students ---")

# Count how many have iqama
has_iqama = 0
total = 0
for doc in db.collection("student_progress").stream():
    d = doc.to_dict()
    total += 1
    iq = d.get("iqama_number", "")
    if iq and iq.strip():
        has_iqama += 1

print(f"\nIqama coverage: {has_iqama}/{total} students have iqama_number")

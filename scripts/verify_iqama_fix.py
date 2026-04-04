"""Verify iqama fix: check Al Walid Saleh + overall coverage."""
import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

# Check Al Walid Saleh
print("=" * 60)
print("Al Walid Saleh check:")
print("=" * 60)
docs = db.collection("student_progress").where("student_number", "==", "0021-431412").get()
for d in docs:
    data = d.to_dict()
    print(f"  Student: {data.get('student_name_en')}")
    print(f"  Passport: {data.get('passport_number')}")
    print(f"  Iqama:    {data.get('iqama_number')}")

# Overall coverage
print(f"\n{'=' * 60}")
print("Overall iqama coverage:")
print(f"{'=' * 60}")
all_docs = db.collection("student_progress").get()
total = 0
has_iqama = 0
for d in all_docs:
    data = d.to_dict()
    total += 1
    iq = data.get("iqama_number", "")
    if iq:
        has_iqama += 1

print(f"  Total students: {total}")
print(f"  With iqama:     {has_iqama} ({has_iqama/total*100:.1f}%)")
print(f"  Without iqama:  {total - has_iqama}")

"""Quick iqama coverage check - just check the iqama_number field."""
import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

# Use select() to only fetch iqama_number field
docs = db.collection("student_progress").select(["iqama_number"]).get()
total = 0
has_iqama = 0
for d in docs:
    total += 1
    data = d.to_dict()
    iq = data.get("iqama_number", "")
    if iq:
        has_iqama += 1

print(f"Total students: {total}")
print(f"With iqama:     {has_iqama} ({has_iqama/total*100:.1f}%)")
print(f"Without iqama:  {total - has_iqama}")

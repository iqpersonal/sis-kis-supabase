"""Check if student exists in various Firestore collections."""
import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate("../dashboard/serviceAccountKey.json")
try:
    app = firebase_admin.get_app()
except:
    app = firebase_admin.initialize_app(cred)

db = firestore.client()

SN = "0021-452112"

# Check students collection
doc = db.collection("students").document(SN).get()
print(f"Exists in students: {doc.exists}")
if doc.exists:
    d = doc.to_dict()
    print(f"  Family: {d.get('Family_Number')}")
    print(f"  Class: {d.get('Class_Code')}")
    print(f"  Section: {d.get('Section_Code')}")

# Check student_progress collection
doc2 = db.collection("student_progress").document(SN).get()
print(f"Exists in student_progress: {doc2.exists}")

# Also check family members in students collection
print(f"\nAll family 0021-4521 in 'students' collection:")
fam_docs = db.collection("students").where("Family_Number", "==", "0021-4521").stream()
for d in fam_docs:
    data = d.to_dict()
    print(f"  {d.id} | fam={data.get('Family_Number')} | class={data.get('Class_Code')}")

print(f"\nAll family 0021-4521 in 'student_progress' collection:")
fam_docs2 = db.collection("student_progress").where("family_number", "==", "0021-4521").stream()
for d in fam_docs2:
    data = d.to_dict()
    print(f"  {d.id} | fam={data.get('family_number')}")

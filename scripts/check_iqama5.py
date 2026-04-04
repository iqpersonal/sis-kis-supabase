import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate(r"c:\Users\Admin\Desktop\Project\SiS\scripts\serviceAccountKey.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

# Check a few students for iqama_number
docs = db.collection("student_progress").limit(20).stream()
has_iqama = 0
for doc in docs:
    d = doc.to_dict()
    iq = d.get("iqama_number", "")
    name = d.get("student_name", "")
    pid = d.get("passport_id", "")
    bp = d.get("birth_place_en", "")
    if iq:
        has_iqama += 1
    print(f"  {name}: iqama={iq}, passport={pid}, birth_place={bp}")

print(f"\n{has_iqama}/20 sampled have iqama_number")

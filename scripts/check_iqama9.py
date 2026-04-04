import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate(r"c:\Users\Admin\Desktop\Project\SiS\scripts\serviceAccountKey.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

# Check specific students
for sn in ["0021-288411", "0021-0334101", "0021-1268101", "0021-318311"]:
    doc = db.collection("student_progress").document(sn).get()
    if doc.exists:
        d = doc.to_dict()
        print(f"{d.get('student_name','')}: iqama={d.get('iqama_number','')}, birth_place={d.get('birth_place_en','')}")
    else:
        print(f"{sn}: NOT FOUND")

import firebase_admin
from firebase_admin import credentials, firestore

if not firebase_admin._apps:
    cred = credentials.Certificate("dashboard/serviceAccountKey.json")
    firebase_admin.initialize_app(cred)

db = firestore.client()

for fid in ["0021-52451", "0021-5245"]:
    doc = db.collection("families").document(fid).get()
    print("--- families/" + fid + " ---")
    if doc.exists:
        d = doc.to_dict()
        print("father_name:", d.get("father_name"))
        print("username:", d.get("username"))
        for k, v in sorted(d.items()):
            if any(x in k.lower() for x in ["phone", "mobile", "tel", "sms"]):
                print(k, ":", repr(v))
    else:
        print("NOT FOUND")
    print()

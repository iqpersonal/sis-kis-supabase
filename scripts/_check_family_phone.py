import firebase_admin
from firebase_admin import credentials, firestore

if not firebase_admin._apps:
    cred = credentials.Certificate("dashboard/serviceAccountKey.json")
    firebase_admin.initialize_app(cred)

db = firestore.client()
snap = db.collection("families").where("family_number", "==", "0021-3632").get()

for doc in snap:
    d = doc.to_dict()
    print(f"Doc ID: {doc.id}")
    print(f"family_number: {d.get('family_number')}")
    print(f"father_name: {d.get('father_name')}")
    print(f"father_phone: [{d.get('father_phone')}] (len={len(str(d.get('father_phone', '')))})")
    print(f"mother_phone: [{d.get('mother_phone')}] (len={len(str(d.get('mother_phone', '')))})")
    print(f"father_email: {d.get('father_email')}")
    print(f"mother_email: {d.get('mother_email')}")
    print()
    print("All phone/mobile/tel fields:")
    for k, v in sorted(d.items()):
        if "phone" in k.lower() or "mobile" in k.lower() or "tel" in k.lower():
            print(f"  {k}: [{v}]")

if not snap:
    print("No family found with family_number 0021-3632")

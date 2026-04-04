"""Check what student_name looks like in Firestore for Al Walid Saleh."""
import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

# Check Al Walid Saleh
docs = db.collection("student_progress").where("student_number", "==", "0021-431412").get()
for d in docs:
    data = d.to_dict()
    print(f"Doc ID: {d.id}")
    print(f"student_name:    '{data.get('student_name', 'MISSING')}'")
    print(f"student_name_ar: '{data.get('student_name_ar', 'MISSING')}'")
    print(f"student_name_en: '{data.get('student_name_en', 'MISSING')}'")
    # Check all keys that have 'name' in them
    print("\nAll keys with 'name':")
    for k, v in sorted(data.items()):
        if 'name' in k.lower():
            print(f"  {k}: '{v}'")

"""One-time script: Update IT store item locations to 'IT Room'"""
import firebase_admin
from firebase_admin import credentials, firestore

if not firebase_admin._apps:
    cred = credentials.Certificate("dashboard/serviceAccountKey.json")
    firebase_admin.initialize_app(cred)

db = firestore.client()
docs = db.collection("its_items").stream()
count = 0
for d in docs:
    data = d.to_dict()
    loc = data.get("location", "")
    db.collection("its_items").document(d.id).update({"location": "IT Room"})
    count += 1
    print(f'Updated: {d.id} ({data.get("name","?")}) "{loc}" -> "IT Room"')

print(f"\nDone. Updated {count} items.")

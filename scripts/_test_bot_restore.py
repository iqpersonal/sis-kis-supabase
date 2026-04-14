"""
Restore the original father_phone after bot testing.
Usage: python scripts/_test_bot_restore.py <family_number>
"""
import os, sys, firebase_admin
from firebase_admin import credentials, firestore

SA_PATH = os.path.join(os.path.dirname(__file__), "..", "dashboard", "serviceAccountKey.json")
if not firebase_admin._apps:
    cred = credentials.Certificate(SA_PATH)
    firebase_admin.initialize_app(cred)

db = firestore.client()

if len(sys.argv) < 2:
    print("Usage: python scripts/_test_bot_restore.py <family_number>")
    sys.exit(1)

fn = sys.argv[1]
doc = db.collection("families").document(fn).get()
if not doc.exists:
    print(f"Family {fn} not found")
    sys.exit(1)

data = doc.to_dict()
original = data.get("_original_father_phone", "")
print(f"Family: {fn}")
print(f"Current father_phone: {data.get('father_phone', '')}")
print(f"Original father_phone: {original}")

db.collection("families").document(fn).update({
    "father_phone": original,
    "_original_father_phone": firestore.DELETE_FIELD,
})
print(f"✅ Restored father_phone to '{original}' and removed backup field.")

"""Check class name mapping in Firestore."""
import firebase_admin
from firebase_admin import credentials, firestore

try:
    app = firebase_admin.get_app()
except:
    app = firebase_admin.initialize_app(credentials.Certificate("../dashboard/serviceAccountKey.json"))

db = firestore.client()

# Check class 13
for doc_id in ["13", "013"]:
    doc = db.collection("classes").document(doc_id).get()
    if doc.exists:
        print(f"Found {doc_id}: {doc.to_dict().get('E_Class_Desc')}")
    else:
        print(f"{doc_id}: not found")

# List all class docs to see format
print("\nAll classes:")
docs = db.collection("classes").order_by("__name__").stream()
for d in docs:
    data = d.to_dict()
    desc = data.get("E_Class_Desc", "?")
    print(f"  {d.id}: {desc}")

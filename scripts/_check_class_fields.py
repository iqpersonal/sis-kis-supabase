"""Check class document fields."""
import firebase_admin
from firebase_admin import credentials, firestore

try:
    app = firebase_admin.get_app()
except:
    app = firebase_admin.initialize_app(credentials.Certificate("../dashboard/serviceAccountKey.json"))

db = firestore.client()

# Get one class doc and show all fields
docs = db.collection("classes").limit(3).stream()
for d in docs:
    data = d.to_dict()
    print(f"\n{d.id}:")
    for k, v in sorted(data.items()):
        if v is not None and str(v).strip():
            print(f"  {k}: {v}")

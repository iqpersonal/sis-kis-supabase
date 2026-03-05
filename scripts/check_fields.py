import firebase_admin
from firebase_admin import credentials, firestore

if not firebase_admin._apps:
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)
db = firestore.client()

# Sample a registration doc
print("=== Registration doc sample ===")
reg = db.collection("registrations").limit(1).get()[0].to_dict()
for k, v in sorted(reg.items()):
    print(f"  {k}: {v!r} ({type(v).__name__})")

print("\n=== Student doc sample ===")
stu = db.collection("students").limit(1).get()[0].to_dict()
for k, v in sorted(stu.items()):
    print(f"  {k}: {v!r} ({type(v).__name__})")

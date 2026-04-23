import sys
sys.path.insert(0, ".")
import firebase_admin
from firebase_admin import credentials, firestore

cred_path = "dashboard/serviceAccountKey.json"
if not firebase_admin._apps:
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)

db = firestore.client()

email = "iqpersonal@gmail.com"
print("Searching for:", email)

# Search by email
docs = db.collection("admin_users").where("email", "==", email).get()
if docs:
    for doc in docs:
        d = doc.to_dict()
        print("Doc ID:", doc.id)
        print("role:", d.get("role"))
        print("secondary_roles:", d.get("secondary_roles"))
        print("displayName:", d.get("displayName"))
        print("All fields:", list(d.keys()))
else:
    print("Not found by email. Listing all super_admin docs:")
    sadocs = db.collection("admin_users").where("role", "==", "super_admin").get()
    for doc in sadocs:
        d = doc.to_dict()
        print(f"  {doc.id}: {d.get('email')} | role={d.get('role')}")

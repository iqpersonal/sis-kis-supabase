"""
Patch Pedro's admin_users doc to add missing username, displayName, firstName, lastName.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import firebase_admin
from firebase_admin import credentials, firestore

cred_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                          "dashboard", "serviceAccountKey.json")
if not firebase_admin._apps:
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)

db = firestore.client()

UID = "yGfUWPyfaCf9LwS2Jy5zZA6y2lJ2"
doc_ref = db.collection("admin_users").document(UID)
doc = doc_ref.get()
if not doc.exists:
    print("ERROR: Document not found!")
    sys.exit(1)

data = doc.to_dict()
print("Current doc:")
for k in ["displayName", "firstName", "lastName", "username", "email", "role"]:
    print(f"  {k}: {data.get(k)}")

updates = {}
if not data.get("firstName"):
    updates["firstName"] = "Pedro"
if not data.get("lastName"):
    updates["lastName"] = "Hindoyan"
if not data.get("displayName"):
    updates["displayName"] = "Pedro Hindoyan"
if not data.get("username"):
    updates["username"] = "pedro.hindoyan"

if updates:
    doc_ref.update(updates)
    print(f"\nPatched fields: {list(updates.keys())}")
    print("Done.")
else:
    print("\nAll fields already set — no changes needed.")

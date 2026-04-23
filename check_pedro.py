import sys, os
sys.path.insert(0, ".")
import firebase_admin
from firebase_admin import credentials, firestore

cred_path = "dashboard/serviceAccountKey.json"
if not firebase_admin._apps:
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)

db = firestore.client()

class_ids = ["CuezV6DGULUbZXBvyLIc", "3cHDMijnUEDpd5NcxgQU", "3MOKu5okpE1EbSQE6c1N"]
print("Checking sections docs for Pedro classes...")
for cid in class_ids:
    doc = db.collection("sections").document(cid).get()
    if doc.exists:
        d = doc.to_dict()
        print(cid + ": Class_Code=" + str(d.get("Class_Code")) + " Section_Code=" + str(d.get("Section_Code")) + " Major_Code=" + str(d.get("Major_Code")))
    else:
        print(cid + ": NOT FOUND in sections collection")

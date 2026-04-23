import sys, os
sys.path.insert(0, ".")
import firebase_admin
from firebase_admin import credentials, firestore

cred_path = "dashboard/serviceAccountKey.json"
if not firebase_admin._apps:
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)

db = firestore.client()

print("Checking all teacher admin_users docs...")
docs = db.collection("admin_users").where("role", "==", "teacher").stream()

no_username = []
no_classes = []
all_teachers = []

for doc in docs:
    d = doc.to_dict()
    name = d.get("displayName") or d.get("firstName", "") + " " + d.get("lastName", "")
    username = d.get("username")
    assigned = d.get("assigned_classes") or []
    all_teachers.append((doc.id, name.strip(), username, len(assigned)))
    if not username:
        no_username.append((doc.id, name.strip()))
    if not assigned:
        no_classes.append((doc.id, name.strip(), username))

print(f"\nTotal teachers: {len(all_teachers)}")
print("\n--- All teachers ---")
for uid, name, uname, cls_count in all_teachers:
    print(f"  {name} | username={uname} | classes={cls_count}")

print(f"\n--- Teachers WITHOUT username field ({len(no_username)}) ---")
for uid, name in no_username:
    print(f"  {name} (uid={uid})")

print(f"\n--- Teachers with NO assigned_classes ({len(no_classes)}) ---")
for uid, name, uname in no_classes:
    print(f"  {name} | username={uname}")

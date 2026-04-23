"""
Check all admin_users docs for missing username/displayName/firstName/lastName fields.
Reports which teachers have the same problem as Pedro.
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

all_docs = list(db.collection("admin_users").stream())
print(f"Total admin_users docs: {len(all_docs)}\n")

missing_username = []
missing_displayname = []
has_classes_no_username = []

for doc in all_docs:
    data = doc.to_dict()
    uid = doc.id
    role = data.get("role", "")
    username = data.get("username") or ""
    display = data.get("displayName") or ""
    first = data.get("firstName") or ""
    last = data.get("lastName") or ""
    email = data.get("email") or ""
    assigned = data.get("assigned_classes") or []

    issues = []
    if not username:
        issues.append("no username")
    if not display:
        issues.append("no displayName")
    if not first:
        issues.append("no firstName")
    if not last:
        issues.append("no lastName")

    if issues:
        print(f"[{role:15}] {uid[:28]}  email={email}")
        print(f"           Issues: {', '.join(issues)}")
        if assigned:
            print(f"           assigned_classes: {len(assigned)} classes  ← AFFECTED")
        print()

        if not username and assigned:
            has_classes_no_username.append((uid, email, role, assigned))

print("=" * 60)
print(f"Users with assigned classes BUT no username: {len(has_classes_no_username)}")
for uid, email, role, assigned in has_classes_no_username:
    print(f"  {role:12} uid={uid}  email={email}  classes={len(assigned)}")

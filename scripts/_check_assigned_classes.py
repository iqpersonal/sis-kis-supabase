"""
List ALL admin_users docs that have assigned_classes, showing their full profile status.
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
print("=" * 70)
print("ALL users with assigned_classes:")
print("=" * 70)

with_classes = []
for doc in all_docs:
    data = doc.to_dict()
    assigned = data.get("assigned_classes") or []
    if not assigned:
        continue

    uid = doc.id
    role = data.get("role", "")
    username = data.get("username") or ""
    display = data.get("displayName") or ""
    first = data.get("firstName") or ""
    last = data.get("lastName") or ""
    email = data.get("email") or ""

    issues = []
    if not username: issues.append("NO username")
    if not display:  issues.append("NO displayName")
    if not first:    issues.append("NO firstName")
    if not last:     issues.append("NO lastName")

    with_classes.append((uid, email, role, username, display, assigned, issues))

    print(f"\n[{role}]  {display or '(no name)'}  <{email}>")
    print(f"  UID:      {uid}")
    print(f"  username: {username or '*** MISSING ***'}")
    print(f"  Issues:   {', '.join(issues) if issues else 'None'}")
    print(f"  Classes ({len(assigned)}):")
    for c in assigned:
        print(f"    - {c.get('className','?')} / {c.get('section','?')}  [{c.get('year','?')}]  id={c.get('classId','?')}")

print(f"\n{'='*70}")
print(f"Total with assigned_classes: {len(with_classes)}")
broken = [(uid, email, role, assigned) for uid, email, role, username, display, assigned, issues in with_classes if not username]
print(f"Of those, missing username (broken on web portal): {len(broken)}")
for uid, email, role, assigned in broken:
    print(f"  [{role}] {email}  ({len(assigned)} classes)")

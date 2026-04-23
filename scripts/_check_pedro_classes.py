"""
Diagnose why Pedro's assigned classes are not showing in the app.
Checks his admin_users doc for assigned_classes field.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import firebase_admin
from firebase_admin import credentials, firestore

# Initialize Firebase Admin
cred_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
                          "dashboard", "serviceAccountKey.json")
if not firebase_admin._apps:
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)

db = firestore.client()

print("=" * 60)
print("Searching admin_users for 'pedro' (name/username/email)...")
print("=" * 60)

# Search by display name
all_docs = db.collection("admin_users").stream()
found = []
for doc in all_docs:
    data = doc.to_dict()
    name = (data.get("displayName") or data.get("firstName") or "").lower()
    username = (data.get("username") or "").lower()
    email = (data.get("email") or "").lower()
    role = data.get("role", "")
    
    if "pedro" in name or "pedro" in username or "pedro" in email:
        found.append((doc.id, data))
        print(f"\nDoc ID (UID): {doc.id}")
        print(f"  displayName: {data.get('displayName')}")
        print(f"  firstName:   {data.get('firstName')}")
        print(f"  lastName:    {data.get('lastName')}")
        print(f"  username:    {data.get('username')}")
        print(f"  email:       {data.get('email')}")
        print(f"  role:        {data.get('role')}")
        print(f"  secondary_roles: {data.get('secondary_roles')}")
        
        assigned = data.get("assigned_classes")
        if assigned:
            print(f"  assigned_classes ({len(assigned)} items):")
            for c in assigned:
                print(f"    - classId={c.get('classId')} | className={c.get('className')} | section={c.get('section')} | year={c.get('year')}")
        else:
            print(f"  assigned_classes: *** NOT FOUND / EMPTY ***")
        
        supervised = data.get("supervised_classes")
        if supervised:
            print(f"  supervised_classes: {supervised}")

if not found:
    print("\nNo admin_users document found with 'pedro' in name/username/email.")
    print("Listing all teachers instead:")
    all_docs2 = db.collection("admin_users").where("role", "==", "teacher").stream()
    for doc in all_docs2:
        data = doc.to_dict()
        print(f"  UID={doc.id} | name={data.get('displayName')} | username={data.get('username')} | classes={len(data.get('assigned_classes') or [])}")

print("\nDone.")

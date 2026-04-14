"""Check the admin_users collection for store clerk users and verify their role field."""
import firebase_admin
from firebase_admin import credentials, firestore, auth

cred = credentials.Certificate(r"C:\Users\Admin\Desktop\Project\SiS\dashboard\serviceAccountKey.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

print("=" * 60)
print("Checking all admin_users documents...")
print("=" * 60)

# List all admin users
docs = db.collection("admin_users").stream()
for d in docs:
    data = d.to_dict()
    role = data.get("role", "NO ROLE FIELD")
    email = data.get("email", "no email")
    name = data.get("displayName", data.get("display_name", "no name"))
    print(f"  UID: {d.id}  |  email: {email}  |  name: {name}  |  role: {role}")

print()
print("=" * 60)
print("Looking for 'iqbal' in Firebase Auth...")
print("=" * 60)

# Search for iqbal user in Firebase Auth
for u in auth.list_users().iterate_all():
    if u.email and "iqbal" in u.email.lower():
        print(f"  UID: {u.uid}")
        print(f"  Email: {u.email}")
        print(f"  Display Name: {u.display_name}")
        # Check if they have an admin_users doc
        adoc = db.collection("admin_users").document(u.uid).get()
        if adoc.exists:
            print(f"  admin_users doc: {adoc.to_dict()}")
        else:
            print(f"  admin_users doc: DOES NOT EXIST")
        print()

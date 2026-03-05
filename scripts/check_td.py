import firebase_admin
from firebase_admin import credentials, firestore

if not firebase_admin._apps:
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)
db = firestore.client()
from google.cloud.firestore_v1.base_query import FieldFilter

# Check what Termination_Date looks like
regs = db.collection("registrations").where(filter=FieldFilter("Academic_Year", "==", "25-26")).limit(10).get()
for r in regs:
    d = r.to_dict()
    td = d.get("Termination_Date")
    sn = d.get("Student_Number")
    print(f"SN={sn}, Termination_Date={td!r} (type={type(td).__name__})")

# Count
print()
all_regs = db.collection("registrations").where(filter=FieldFilter("Academic_Year", "==", "25-26")).get()
has_td = sum(1 for r in all_regs if r.to_dict().get("Termination_Date") is not None)
no_td = sum(1 for r in all_regs if r.to_dict().get("Termination_Date") is None)
print(f"Has Termination_Date: {has_td}")
print(f"No Termination_Date (active): {no_td}")

# Show a few with termination dates
print("\nSamples with Termination_Date:")
count = 0
for r in all_regs:
    d = r.to_dict()
    td = d.get("Termination_Date")
    if td is not None and count < 5:
        print(f"  SN={d.get('Student_Number')}, TD={td!r} (type={type(td).__name__})")
        count += 1

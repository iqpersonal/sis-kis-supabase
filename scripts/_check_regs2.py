"""Check registration data for a student."""
import firebase_admin
from firebase_admin import credentials, firestore

try:
    app = firebase_admin.get_app()
except:
    app = firebase_admin.initialize_app(credentials.Certificate("../dashboard/serviceAccountKey.json"))

db = firestore.client()

# Check registration collection
docs = db.collection("registrations").where("Student_Number", "==", "0021-452112").stream()
count = 0
for d in docs:
    data = d.to_dict()
    count += 1
    yr = data.get("Academic_Year")
    cl = data.get("Class_Code")
    sec = data.get("Section_Code")
    sch = data.get("School_Code")
    maj = data.get("Major_Code")
    print(f"  {d.id}: year={yr} class={cl} section={sec} school={sch} major={maj}")
print(f"Total registrations: {count}")

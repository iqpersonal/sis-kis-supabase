"""Check students WITH grandfather name in Firestore."""
import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

# Get a few docs and find ones with 4-part names
docs = db.collection("student_progress").select(["student_name", "student_name_ar"]).limit(200).get()
found = 0
for d in docs:
    data = d.to_dict()
    name = data.get("student_name", "")
    parts = name.split() if name else []
    if len(parts) >= 4:
        print(f"  {d.id}: {name}")
        found += 1
        if found >= 10:
            break

if found == 0:
    print("No 4+ part names found in first 200 docs")

# Also count name-part distribution
print("\n--- Name part distribution (first 200) ---")
counts = {}
for d in docs:
    data = d.to_dict()
    name = data.get("student_name", "")
    n = len(name.split()) if name else 0
    counts[n] = counts.get(n, 0) + 1
for k in sorted(counts):
    print(f"  {k} parts: {counts[k]} students")

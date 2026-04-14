"""Check Firestore families collection for phone data coverage."""
import firebase_admin
from firebase_admin import credentials, firestore

if not firebase_admin._apps:
    cred = credentials.Certificate("dashboard/serviceAccountKey.json")
    firebase_admin.initialize_app(cred)
db = firestore.client()

# Count families with/without phone data
total = 0
has_father_phone = 0
has_mother_phone = 0
has_any_phone = 0
no_phone = 0
sample_with = []
sample_without = []

for doc in db.collection("families").stream():
    d = doc.to_dict()
    total += 1
    fp = (d.get("father_phone") or "").strip()
    mp = (d.get("mother_phone") or "").strip()
    fn = d.get("family_number", doc.id)

    if fp:
        has_father_phone += 1
    if mp:
        has_mother_phone += 1
    if fp or mp:
        has_any_phone += 1
        if len(sample_with) < 5:
            sample_with.append((fn, fp, mp))
    else:
        no_phone += 1
        if len(sample_without) < 5:
            sample_without.append((fn, d.get("father_name", ""), d.get("family_name", "")))

print("=== Firestore families phone coverage ===")
print(f"  Total families:     {total}")
print(f"  Has father_phone:   {has_father_phone}")
print(f"  Has mother_phone:   {has_mother_phone}")
print(f"  Has ANY phone:      {has_any_phone}")
print(f"  NO phone at all:    {no_phone}")
print(f"  Coverage:           {has_any_phone}/{total} ({100*has_any_phone//total if total else 0}%)")

print(f"\n=== Sample families WITH phone ===")
for fn, fp, mp in sample_with:
    print(f"  {fn}: father={fp}, mother={mp}")

print(f"\n=== Sample families WITHOUT phone ===")
for fn, fname, lname in sample_without:
    print(f"  {fn}: {fname} {lname}")

# Check one of the families that DO have phones in the Firestore sample
if sample_with:
    fn_check = sample_with[0][0]
    print(f"\n=== Verifying family {fn_check} in Firestore ===")
    doc = db.collection("families").document(fn_check).get()
    if doc.exists:
        d = doc.to_dict()
        print(f"  father_phone: [{d.get('father_phone')}]")
        print(f"  mother_phone: [{d.get('mother_phone')}]")
        print(f"  father_email: [{d.get('father_email')}]")
    else:
        print(f"  Not found by doc ID")

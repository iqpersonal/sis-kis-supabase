"""Verify terminated students are excluded from the updated browse index."""
import os, firebase_admin
from firebase_admin import credentials, firestore

if not firebase_admin._apps:
    cred = credentials.Certificate(os.path.join(os.path.dirname(__file__), "serviceAccountKey.json"))
    firebase_admin.initialize_app(cred)

db = firestore.client()
doc = db.collection("parent_config").document("browse_25-26").get()
data = doc.to_dict()
buckets = data.get("buckets", {})

# Check section 33__03__0021-01 (Melons Boys' Grade 12)
sec03 = buckets.get("33__03__0021-01", [])
print(f"33__03__0021-01 (Melons Boys Grade 12): {len(sec03)} students")
for s in sorted(sec03, key=lambda x: x["name"]):
    print(f"  {s['name']} (SN: {s['sn']})")

print()

# Check if Ahmad Baghdadi or Nikolaos Ergas is in ANY bucket
for name_check in ["Baghdadi", "Nikolaos", "Ergas"]:
    found = False
    for k, v in buckets.items():
        for s in v:
            if name_check in s.get("name", ""):
                print(f"'{name_check}' found in: {k} -> {s['name']}")
                found = True
    if not found:
        print(f"'{name_check}' NOT found in any 25-26 bucket")

print()

# Count all Grade 12 Boys
g12_boys_keys = sorted([k for k in buckets if k.startswith("33__") and k.endswith("__0021-01")])
total = 0
for k in g12_boys_keys:
    cnt = len(buckets[k])
    total += cnt
    print(f"  {k}: {cnt} students")
print(f"Total Grade 12 Boys: {total}")

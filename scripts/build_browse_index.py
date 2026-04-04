"""Quick script to build and upload the browse index from existing Firestore data."""
import os, sys
from datetime import datetime

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    sys.exit("firebase-admin required")

KEY_PATH = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")

if not firebase_admin._apps:
    firebase_admin.initialize_app(credentials.Certificate(KEY_PATH))
db = firestore.client()

print("Fetching all student_progress documents...")
snapshot = db.collection("student_progress").get()
print(f"  {len(snapshot)} documents")

browse_index = {}  # year -> bucket_key -> list
for doc in snapshot:
    d = doc.to_dict()
    sn = d.get("student_number", doc.id)
    for yr, yd in d.get("years", {}).items():
        cc = yd.get("class_code", "")
        sc = yd.get("section_code", "")
        school = yd.get("school", "")
        if not cc:
            continue
        bucket_key = f"{cc}__{sc}__{school}"
        browse_index.setdefault(yr, {}).setdefault(bucket_key, []).append({
            "sn": sn,
            "name": d.get("student_name", ""),
            "gender": d.get("gender", ""),
            "fam": d.get("family_number", ""),
            "avg": yd.get("overall_avg", 0),
            "class": yd.get("class_name", ""),
            "section": yd.get("section_name", ""),
        })

total = sum(len(v) for buckets in browse_index.values() for v in buckets.values())
print(f"  {len(browse_index)} years, {total} entries")

print("\nUploading browse index...")
for yr, buckets in sorted(browse_index.items()):
    db.collection("parent_config").document(f"browse_{yr}").set({
        "year": yr,
        "buckets": buckets,
        "updated_at": datetime.utcnow().isoformat(),
    })
    entry_count = sum(len(v) for v in buckets.values())
    print(f"  browse_{yr}: {len(buckets)} groups, {entry_count} students")

print(f"\nDone! {len(browse_index)} browse index documents uploaded.")

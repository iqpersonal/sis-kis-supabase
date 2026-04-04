import firebase_admin
from firebase_admin import credentials, firestore

if not firebase_admin._apps:
    cred = credentials.Certificate('serviceAccountKey.json')
    firebase_admin.initialize_app(cred)

db = firestore.client()

# Find all Grade 4/5/6 sections in Boys' School (0021-01) for 25-26
print("=== Finding Grade 4/5/6 sections in Boys' School (0021-01) for 25-26 ===")
secs = db.collection('sections') \
    .where('Academic_Year', '==', '25-26') \
    .where('Major_Code', '==', '0021-01') \
    .get()

to_delete = []
for s in secs:
    sd = s.to_dict()
    cc = sd.get('Class_Code')
    if cc in ['24', '25', '26']:
        to_delete.append((s.id, cc, sd.get('Section_Desc', '')))

print(f"Found {len(to_delete)} sections to delete:\n")
for doc_id, cc, desc in sorted(to_delete, key=lambda x: (x[1], x[2])):
    print(f"  ID={doc_id}  Class_Code={cc}  Section={desc}")

print(f"\nDeleting {len(to_delete)} sections...")
batch = db.batch()
for doc_id, cc, desc in to_delete:
    batch.delete(db.collection('sections').document(doc_id))
batch.commit()
print("Done! All empty Grade 4/5/6 Boys' School sections removed.")

# Verify
print("\n=== Verification: Boys' School sections for 25-26 ===")
remaining = db.collection('sections') \
    .where('Academic_Year', '==', '25-26') \
    .where('Major_Code', '==', '0021-01') \
    .get()

grade_counts = {}
for s in remaining:
    sd = s.to_dict()
    cc = sd.get('Class_Code')
    grade_counts[cc] = grade_counts.get(cc, 0) + 1

for cc in sorted(grade_counts.keys()):
    print(f"  Class_Code {cc}: {grade_counts[cc]} sections")

import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate('serviceAccountKey.json')
firebase_admin.initialize_app(cred)
db = firestore.client()

# Check specific students we know have previous schools from SQL view
test_sns = ['0021-1396101', '0021-2182101', '0021-278711', '0021-281012']
for sn in test_sns:
    doc = db.collection('student_progress').document(sn).get()
    if doc.exists:
        data = doc.to_dict()
        ps = data.get('prev_school_en', 'FIELD_MISSING')
        name = data.get('student_name', '?')
        print(f"{sn}: prev_school_en='{ps}', name={name}")
    else:
        print(f"{sn}: NOT FOUND in Firestore")

# Count students with non-empty prev_school_en
print("\nCounting students with prev_school data...")
all_docs = db.collection('student_progress').get()
total = 0
with_prev = 0
samples = []
for d in all_docs:
    total += 1
    data = d.to_dict()
    ps = data.get('prev_school_en', '')
    if ps and ps.strip():
        with_prev += 1
        if len(samples) < 5:
            samples.append(f"  {d.id}: '{ps}'")
print(f"Total students: {total}, With prev_school: {with_prev}")
for s in samples:
    print(s)

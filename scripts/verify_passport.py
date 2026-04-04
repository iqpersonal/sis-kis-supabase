import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate('serviceAccountKey.json')
app = firebase_admin.initialize_app(cred)
db = firestore.client()

# Check Abdalla Hamed Aly
doc = db.collection('student_progress').document('0021-303311').get()
if doc.exists:
    d = doc.to_dict()
    print(f"Student: {d.get('student_name')}")
    print(f"Passport (should be A16401048): {d.get('passport_id')}")
    print(f"Iqama: {d.get('iqama_number')}")
    print(f"Nationality: {d.get('nationality_en')}")
    print(f"DOB: {d.get('dob')}")
    print(f"Enrollment: {d.get('enrollment_date')}")
    print()
    
    # Check a few more students for passport correctness
    docs = db.collection('student_progress').limit(200).get()
    with_passport = 0
    sample = []
    for dd in docs:
        data = dd.to_dict()
        pid = data.get('passport_id', '')
        if pid:
            with_passport += 1
            if len(sample) < 5:
                sample.append((dd.id, data.get('student_name', ''), pid))
    print(f"Of 200 sampled docs: {with_passport} have passport")
    print("Sample passports:")
    for s in sample:
        print(f"  {s[0]}: {s[1]} -> {s[2]}")
else:
    print("Document not found!")

firebase_admin.delete_app(app)

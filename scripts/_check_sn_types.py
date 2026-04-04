import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate('scripts/serviceAccountKey.json')
try:
    firebase_admin.get_app()
except:
    firebase_admin.initialize_app(cred)

db = firestore.client()

# Count students
count = 0
for _ in db.collection('students').stream():
    count += 1
print(f"Total students: {count}")

# Check a registration's Student_Number type
reg = db.collection('registrations').where('Academic_Year', '==', '25-26').limit(3).stream()
for doc in reg:
    d = doc.to_dict()
    sn = d.get('Student_Number')
    print(f"  Reg Student_Number: {sn!r} (type={type(sn).__name__})")

# Check a student's Student_Number type
stu = db.collection('students').limit(3).stream()
for doc in stu:
    d = doc.to_dict()
    sn = d.get('Student_Number')
    print(f"  Stu Student_Number: {sn!r} (type={type(sn).__name__})")

import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate('serviceAccountKey.json')
app = firebase_admin.initialize_app(cred)
db = firestore.client()

docs = db.collection('student_registrations').limit(2).get()
for d in docs:
    data = d.to_dict()
    print('ID:', d.id)
    print('Keys:', sorted(data.keys()))
    print('Major_Code:', data.get('Major_Code', 'N/A'))
    print('Academic_Year:', data.get('Academic_Year', 'N/A'))
    print('Student_Number:', data.get('Student_Number', 'N/A'))
    print()

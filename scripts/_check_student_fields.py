import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate('serviceAccountKey.json')
app = firebase_admin.initialize_app(cred)
db = firestore.client()

doc = db.collection('students').limit(3).get()
for d_doc in doc:
    d = d_doc.to_dict()
    print('ID:', d_doc.id)
    print('Keys:', sorted(d.keys()))
    print('Major_Code:', d.get('Major_Code', 'N/A'))
    print('school:', d.get('school', 'N/A'))
    print('Gender:', d.get('Gender', 'N/A'))
    print('---')

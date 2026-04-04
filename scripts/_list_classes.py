import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate('serviceAccountKey.json')
app = firebase_admin.initialize_app(cred)
db = firestore.client()

docs = db.collection('classes').get()
for d in sorted(docs, key=lambda x: int(x.to_dict().get('Class_Code', 0) or 0)):
    data = d.to_dict()
    code = data.get('Class_Code', '')
    en = data.get('E_Class_Desc', '')
    ar = data.get('A_Class_Desc', '')
    print(f"{code:>3} | {en:30s} | {ar}")

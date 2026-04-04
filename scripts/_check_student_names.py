import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate('scripts/serviceAccountKey.json')
try:
    firebase_admin.get_app()
except:
    firebase_admin.initialize_app(cred)

db = firestore.client()
docs = db.collection('students').limit(5).stream()
for doc in docs:
    d = doc.to_dict()
    name_keys = [k for k in d.keys() if 'name' in k.lower() or 'full' in k.lower() or 'child' in k.lower()]
    print(f"{doc.id}: {name_keys}")
    for k in name_keys:
        print(f"  {k} = {d[k]}")

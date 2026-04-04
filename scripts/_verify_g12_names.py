import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate('scripts/serviceAccountKey.json')
try:
    firebase_admin.get_app()
except:
    firebase_admin.initialize_app(cred)

db = firestore.client()

# Check G12 students
regs = db.collection('registrations').where('Academic_Year', '==', '25-26').stream()
g12_sns = []
for doc in regs:
    d = doc.to_dict()
    if d.get('Termination_Date'):
        continue
    cls = str(d.get('Class_Code', ''))
    if cls.startswith('21'):
        g12_sns.append(str(d.get('Student_Number', '')))

print(f"G12 active students: {len(g12_sns)}")
print("\nSample names (with grandfather):")
for sn in g12_sns[:15]:
    sdoc = db.collection('students').document(sn).get()
    if sdoc.exists:
        s = sdoc.to_dict()
        fn = s.get('E_Full_Name', '')
        gf = s.get('E_Grand_Father', '')
        print(f"  {sn}: '{fn}'  (GrandF='{gf}')")
    else:
        print(f"  {sn}: NOT FOUND")

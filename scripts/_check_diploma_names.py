import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate('scripts/serviceAccountKey.json')
try:
    firebase_admin.get_app()
except:
    firebase_admin.initialize_app(cred)

db = firestore.client()

# Check students: doc ID vs Student_Number field
print("=== STUDENTS (first 5) ===")
docs = db.collection('students').limit(5).stream()
for doc in docs:
    d = doc.to_dict()
    sn = d.get('Student_Number', 'MISSING')
    fn = d.get('E_Full_Name', 'MISSING')
    print(f"  doc.id={doc.id}  Student_Number={sn}  E_Full_Name={fn}")

# Check registrations: Student_Number field
print("\n=== REGISTRATIONS (first 5, year 25-26) ===")
q = db.collection('registrations').where('Academic_Year', '==', '25-26').limit(5)
for doc in q.stream():
    d = doc.to_dict()
    sn = d.get('Student_Number', 'MISSING')
    cls = d.get('Class_Code', '')
    major = d.get('Major_Code', '')
    term = d.get('Termination_Date', None)
    print(f"  doc.id={doc.id}  Student_Number={sn}  Class={cls}  Major={major}  Terminated={term}")

# Check if Student_Number in registrations matches keys in students
print("\n=== MATCHING CHECK ===")
# Get a few student numbers from registrations
reg_docs = db.collection('registrations').where('Academic_Year', '==', '25-26').limit(10).stream()
reg_sns = []
for doc in reg_docs:
    d = doc.to_dict()
    sn = d.get('Student_Number')
    if sn and not d.get('Termination_Date'):
        reg_sns.append(str(sn))

for sn in reg_sns[:5]:
    # Try to find in students by Student_Number field
    q2 = db.collection('students').where('Student_Number', '==', sn).limit(1).stream()
    found_by_field = list(q2)
    # Try to find by doc ID
    doc_ref = db.collection('students').document(sn).get()
    found_by_id = doc_ref.exists
    
    name = ''
    if found_by_id:
        name = doc_ref.to_dict().get('E_Full_Name', '')
    elif found_by_field:
        name = found_by_field[0].to_dict().get('E_Full_Name', '')
    
    print(f"  SN={sn}  by_field={len(found_by_field)>0}  by_docid={found_by_id}  name={name}")

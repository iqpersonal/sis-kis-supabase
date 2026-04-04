import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate('scripts/serviceAccountKey.json')
try:
    firebase_admin.get_app()
except:
    firebase_admin.initialize_app(cred)

db = firestore.client()

# Get registrations for 25-26 year, class 212 (Grade 12) - active only
print("=== Grade 12 registrations (25-26) ===")
regs = db.collection('registrations').where('Academic_Year', '==', '25-26').stream()
g12_regs = []
for doc in regs:
    d = doc.to_dict()
    cls = str(d.get('Class_Code', ''))
    term = d.get('Termination_Date')
    if cls.startswith('21') and not term:  # Grade 12 classes typically 212, etc.
        g12_regs.append(d)

print(f"Found {len(g12_regs)} active G12 registrations")
for r in g12_regs[:10]:
    sn = str(r.get('Student_Number', ''))
    cls = r.get('Class_Code')
    sec = r.get('Section_Code')
    major = r.get('Major_Code')
    
    # Lookup student
    stu_doc = db.collection('students').document(sn).get()
    if stu_doc.exists:
        sd = stu_doc.to_dict()
        fn = sd.get('E_Full_Name', '')
        cn = sd.get('E_Child_Name', '')
        print(f"  SN={sn} Class={cls} Sec={sec} Major={major} E_Full_Name='{fn}' E_Child_Name='{cn}'")
    else:
        print(f"  SN={sn} Class={cls} Sec={sec} Major={major} *** STUDENT NOT FOUND ***")

# Also check: are there students with empty E_Full_Name?
print("\n=== Students with empty E_Full_Name ===")
empty_count = 0
all_docs = db.collection('students').stream()
for doc in all_docs:
    d = doc.to_dict()
    fn = d.get('E_Full_Name', '')
    if not fn or fn.strip() == '':
        empty_count += 1
        if empty_count <= 5:
            print(f"  {doc.id}: E_Full_Name='{fn}' E_Child_Name='{d.get('E_Child_Name', '')}'")
print(f"Total students with empty E_Full_Name: {empty_count}")

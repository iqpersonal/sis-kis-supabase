import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate('scripts/serviceAccountKey.json')
try:
    firebase_admin.get_app()
except:
    firebase_admin.initialize_app(cred)

db = firestore.client()

# Check all available name fields on a student
doc = db.collection('students').document('0021-0001101').get()
d = doc.to_dict()
name_fields = sorted([k for k in d.keys() if any(x in k.lower() for x in ['name', 'full', 'child', 'father', 'family', 'grand', 'mother'])])
print("All name-related fields:")
for k in name_fields:
    print(f"  {k} = {d[k]}")

# Check G12 students: compare E_Full_Name with component parts
print("\n=== G12 student names breakdown ===")
regs = db.collection('registrations').where('Academic_Year', '==', '25-26').stream()
g12_sns = []
for rdoc in regs:
    r = rdoc.to_dict()
    if r.get('Termination_Date'):
        continue
    cls = str(r.get('Class_Code', ''))
    if cls.startswith('21'):
        g12_sns.append(str(r.get('Student_Number', '')))

for sn in g12_sns[:15]:
    sdoc = db.collection('students').document(sn).get()
    if not sdoc.exists:
        print(f"  {sn}: NOT FOUND")
        continue
    s = sdoc.to_dict()
    fn = s.get('E_Full_Name', '')
    cn = s.get('E_Child_Name', '')
    fa = s.get('E_Father_Name', '')
    fam = s.get('E_Family_Name', '')
    gf = s.get('E_GrandFather_Name', s.get('E_Grandfather_Name', ''))
    print(f"  {sn}: E_Full_Name='{fn}'")
    print(f"    Child='{cn}' Father='{fa}' GrandF='{gf}' Family='{fam}'")
    # Check if E_Full_Name is just the first name
    if fn == cn:
        print(f"    *** WARNING: E_Full_Name == E_Child_Name (only first name!) ***")

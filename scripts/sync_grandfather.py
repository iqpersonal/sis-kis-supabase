"""
Sync E_Grand_Father and A_Grand_Father from SQL Server Family table
into Firestore students collection.

For each student, looks up their Family_Number and adds E_Grand_Father / A_Grand_Father.
Also rebuilds E_Full_Name to include the grandfather name:
  E_Child_Name + E_Father_Name + E_Grand_Father + E_Family_Name
"""
import pyodbc
import firebase_admin
from firebase_admin import credentials, firestore

# Firebase
cred = credentials.Certificate('scripts/serviceAccountKey.json')
try:
    firebase_admin.get_app()
except:
    firebase_admin.initialize_app(cred)
db = firestore.client()

# SQL Server
conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=172.16.1.160\\SQL2016;"
    "DATABASE=SIS;"
    "UID=sis_reader;"
    "PWD=Sis@12345Reader;"
)
cursor = conn.cursor()

# Get grandfather names from Family table, keyed by Family_Number
cursor.execute("""
    SELECT Family_Number, E_Grand_Father, A_Grand_Father
    FROM Family
    WHERE E_Grand_Father IS NOT NULL AND LTRIM(RTRIM(E_Grand_Father)) != ''
""")
grandfather_map = {}
for row in cursor.fetchall():
    fam_num = row.Family_Number.strip() if row.Family_Number else None
    if fam_num:
        grandfather_map[fam_num] = {
            'E_Grand_Father': (row.E_Grand_Father or '').strip(),
            'A_Grand_Father': (row.A_Grand_Father or '').strip(),
        }

print(f"Loaded {len(grandfather_map)} families with grandfather names from SQL Server")
conn.close()

# Now update Firestore students
batch_size = 500
batch = db.batch()
count = 0
updated = 0
skipped = 0

all_students = db.collection('students').stream()
for doc in all_students:
    d = doc.to_dict()
    family_number = d.get('Family_Number', '')
    
    if not family_number:
        skipped += 1
        continue
    
    gf_data = grandfather_map.get(family_number)
    if not gf_data:
        skipped += 1
        continue
    
    e_gf = gf_data['E_Grand_Father']
    a_gf = gf_data['A_Grand_Father']
    
    # Skip if already synced with same value
    existing_gf = d.get('E_Grand_Father', '')
    if existing_gf == e_gf:
        skipped += 1
        continue
    
    # Build new full name: Child + Father + Grandfather + Family
    e_child = (d.get('E_Child_Name', '') or '').strip()
    e_father = (d.get('E_Father_Name', '') or '').strip()
    e_family = (d.get('E_Family_Name', '') or '').strip()
    
    # Build 4-part name
    parts = [p for p in [e_child, e_father, e_gf, e_family] if p]
    new_full_name = ' '.join(parts)
    
    # Similarly for Arabic
    a_child = (d.get('A_Child_Name', '') or '').strip()
    a_father = (d.get('A_Father_Name', '') or '').strip()
    a_family = (d.get('A_Family_Name', '') or '').strip()
    a_parts = [p for p in [a_child, a_father, a_gf, a_family] if p]
    new_a_full_name = ' '.join(a_parts) if a_child else ''
    
    update = {
        'E_Grand_Father': e_gf,
        'A_Grand_Father': a_gf,
        'E_Full_Name': new_full_name,
    }
    if new_a_full_name:
        update['A_Full_Name'] = new_a_full_name
    
    ref = db.collection('students').document(doc.id)
    batch.update(ref, update)
    count += 1
    updated += 1
    
    if count >= batch_size:
        batch.commit()
        print(f"  Committed {updated} updates so far...")
        batch = db.batch()
        count = 0

if count > 0:
    batch.commit()

print(f"\nDone! Updated {updated} students, skipped {skipped}")

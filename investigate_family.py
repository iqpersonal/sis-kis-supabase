import pyodbc
import firebase_admin
from firebase_admin import credentials, firestore

if not firebase_admin._apps:
    cred = credentials.Certificate('dashboard/serviceAccountKey.json')
    firebase_admin.initialize_app(cred)

db = firestore.client()

print('=== FIRESTORE: sponsors collection for family 0021-5245 ===')
snaps = db.collection('sponsors').where('Family_Number', '==', '0021-5245').get()
for doc in snaps:
    d = doc.to_dict()
    print('Doc ID:', doc.id)
    for k, v in sorted(d.items()):
        kl = k.lower()
        if 'phone' in kl or 'mobile' in kl or 'tel' in kl or 'family_number' in kl or 'name' in kl:
            print('  ', k, ':', v)

print()
print('=== FIRESTORE: families doc 0021-5245 ===')
fam_doc = db.collection('families').document('0021-5245').get()
if fam_doc.exists:
    d = fam_doc.to_dict()
    children = d.get('children', [])
    sns = [str(c.get('student_number')) for c in children]
    print('Children:', sns)
    if sns:
        sn = sns[0]
        prog = db.collection('student_progress').document(sn).get()
        if prog.exists:
            pd2 = prog.to_dict()
            raw_f = pd2.get('raw_family', {})
            print('raw_family keys:', list(raw_f.keys()))
            for fk in ['Father_phone', 'Mother_phone', 'Father_Mobile', 'Mother_Mobile']:
                print('raw_family.' + fk + ':', raw_f.get(fk, 'NOT FOUND'))
        else:
            print('No student_progress for student:', sn)
else:
    print('No families doc for 0021-5245')

print()
print('=== SQL SERVER: Family table for 0021-5245 ===')
try:
    conn = pyodbc.connect('DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\SQLEXPRESS;DATABASE=_bak_import_temp;Trusted_Connection=yes;')
    cur = conn.cursor()
    cur.execute("SELECT * FROM Family WHERE Family_Number = '0021-5245'")
    cols = [d[0] for d in cur.description]
    rows = cur.fetchall()
    if rows:
        for row in rows:
            for col, val in zip(cols, row):
                if val is not None and str(val).strip():
                    print(' ', col, ':', val)
    else:
        print('  No row found')
    print()
    print('=== SQL SERVER: Sponsor table for 0021-5245 ===')
    cur.execute("SELECT * FROM Sponsor WHERE Family_Number = '0021-5245'")
    cols2 = [d[0] for d in cur.description]
    rows2 = cur.fetchall()
    if rows2:
        for row in rows2:
            for col, val in zip(cols2, row):
                if val is not None and str(val).strip():
                    print(' ', col, ':', val)
    else:
        print('  No sponsor rows')
    conn.close()
except Exception as e:
    print('SQL error:', e)
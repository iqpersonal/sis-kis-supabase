"""
Re-upload students with full English name (Child + Father + Family)
from Student + Family_Children + Family join.
"""
import pyodbc
import firebase_admin
from firebase_admin import credentials, firestore

if not firebase_admin._apps:
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)
db = firestore.client()

conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=.\\SQLEXPRESS;"
    "DATABASE=_bak_import_temp;"
    "Trusted_Connection=yes"
)
cur = conn.cursor()

cur.execute("""
    SELECT
        s.Student_Number,
        s.Family_Number,
        s.Family_Sub,
        s.Child_Number,
        s.Enrollment_Date,
        s.Email,
        s.Barcode,
        s.UserName,
        s.Password,
        s.Medical_Follow_Up,
        s.Mod_Date,
        s.Mod_User,
        s.DBGUID,
        s.RowGUID,
        fc.E_Child_Name,
        fc.A_Child_Name,
        fc.Gender,
        fc.Child_Birth_Date,
        fc.Nationality_Code_Primary,
        fc.Nationality_Code_Secondary,
        fc.A_Child_Birth_Place,
        fc.E_Child_Birth_Place,
        fc.Child_Blood_Type,
        f.E_Father_Name,
        f.E_Family_Name,
        f.A_Father_Name,
        f.A_Family_Name,
        RTRIM(LTRIM(
            ISNULL(fc.E_Child_Name,'') + ' ' +
            ISNULL(f.E_Father_Name,'') + ' ' +
            ISNULL(f.E_Family_Name,'')
        )) as E_Full_Name,
        RTRIM(LTRIM(
            ISNULL(fc.A_Child_Name,'') + ' ' +
            ISNULL(f.A_Father_Name,'') + ' ' +
            ISNULL(f.A_Family_Name,'')
        )) as A_Full_Name
    FROM Student s
    JOIN Family_Children fc
        ON s.Family_Number = fc.Family_Number
        AND s.Family_Sub = fc.Family_Sub
        AND s.Child_Number = fc.Child_Number
    JOIN Family f
        ON s.Family_Number = f.Family_Number
        AND s.Family_Sub = f.Family_Sub
""")
columns = [desc[0] for desc in cur.description]
rows = cur.fetchall()
conn.close()

print(f"Fetched {len(rows)} students with full names")

# Delete existing
print("Deleting existing students...")
existing = db.collection("students").get()
batch = db.batch()
count = 0
for doc in existing:
    batch.delete(doc.reference)
    count += 1
    if count % 500 == 0:
        batch.commit()
        batch = db.batch()
        print(f"  Deleted {count}...")
if count % 500 != 0:
    batch.commit()
print(f"  Deleted {count} docs")

# Upload
print("Uploading students with full names...")
batch = db.batch()
uploaded = 0
for row in rows:
    doc = {}
    for col, val in zip(columns, row):
        if val is None:
            doc[col] = None
        elif hasattr(val, 'isoformat'):
            doc[col] = val.isoformat()
        elif isinstance(val, bytes):
            continue
        else:
            doc[col] = val

    sn = str(doc.get("Student_Number", ""))
    if not sn:
        continue

    ref = db.collection("students").document(sn)
    batch.set(ref, doc)
    uploaded += 1

    if uploaded % 500 == 0:
        batch.commit()
        batch = db.batch()
        print(f"  Uploaded {uploaded}/{len(rows)}...")

if uploaded % 500 != 0:
    batch.commit()

print(f"\nDone! Uploaded {uploaded} students")

# Verify
sample = db.collection("students").limit(3).get()
print("\nSamples:")
for d in sample:
    data = d.to_dict()
    print(f"  {data.get('Student_Number')}: {data.get('E_Full_Name')} | Nat={data.get('Nationality_Code_Primary')}")

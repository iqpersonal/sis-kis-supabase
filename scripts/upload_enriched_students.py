"""
Re-upload students collection with enriched data from Student + Family_Children join.
Adds: E_Child_Name, A_Child_Name, Gender, Child_Birth_Date, Nationality_Code_Primary
"""
import pyodbc
import firebase_admin
from firebase_admin import credentials, firestore

# ── Firebase ──
if not firebase_admin._apps:
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)
db = firestore.client()

# ── SQL Server ──
conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=.\\SQLEXPRESS;"
    "DATABASE=_bak_import_temp;"
    "Trusted_Connection=yes"
)
cur = conn.cursor()

# Fetch joined student + family_children data
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
        fc.F_Child_Name,
        fc.Gender,
        fc.Child_Birth_Date,
        fc.Nationality_Code_Primary,
        fc.Nationality_Code_Secondary,
        fc.A_Child_Birth_Place,
        fc.E_Child_Birth_Place,
        fc.Child_Blood_Type
    FROM Student s
    JOIN Family_Children fc
        ON s.Family_Number = fc.Family_Number
        AND s.Family_Sub = fc.Family_Sub
        AND s.Child_Number = fc.Child_Number
""")
columns = [desc[0] for desc in cur.description]
rows = cur.fetchall()
conn.close()

print(f"Fetched {len(rows)} enriched student records from SQL Server")

# Delete existing students collection
print("Deleting existing students collection...")
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
print(f"  Deleted {count} existing docs")

# Upload enriched students
print("Uploading enriched students...")
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
            continue  # skip binary
        else:
            doc[col] = val
    
    # Use Student_Number as document ID
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

print(f"\nDone! Uploaded {uploaded} enriched student records")

# Verify
sample = db.collection("students").limit(3).get()
print("\nSample docs:")
for d in sample:
    data = d.to_dict()
    print(f"  SN={data.get('Student_Number')}, "
          f"E_Name={data.get('E_Child_Name')}, "
          f"A_Name={data.get('A_Child_Name')}, "
          f"Gender={data.get('Gender')}, "
          f"DOB={data.get('Child_Birth_Date')}, "
          f"Nat={data.get('Nationality_Code_Primary')}")

import pyodbc
conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=.\\SQLEXPRESS;"
    "DATABASE=_bak_import_temp;"
    "Trusted_Connection=yes"
)
cur = conn.cursor()

# Check Family table for family name
cur.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Family' AND TABLE_TYPE='BASE TABLE'")
print("Family table exists:", bool(cur.fetchall()))

cur.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Family' ORDER BY ORDINAL_POSITION")
fam_cols = [r[0] for r in cur.fetchall()]
print("Family columns:", fam_cols)

# Sample join to get full name
cur.execute("""
    SELECT TOP 5
        s.Student_Number,
        fc.E_Child_Name,
        f.E_Father_Name,
        f.E_Family_Name,
        fc.E_Child_Name + ' ' + ISNULL(f.E_Father_Name,'') + ' ' + ISNULL(f.E_Family_Name,'') as E_Full_Name
    FROM Student s
    JOIN Family_Children fc ON s.Family_Number = fc.Family_Number AND s.Family_Sub = fc.Family_Sub AND s.Child_Number = fc.Child_Number
    JOIN Family f ON s.Family_Number = f.Family_Number AND s.Family_Sub = f.Family_Sub
""")
print("\nFull name samples:")
for row in cur.fetchall():
    print(f"  SN={row[0]}: Child={row[1]}, Father={row[2]}, Family={row[3]} => Full={row[4]}")

# Check nationalities collection
cur.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Nationality' ORDER BY ORDINAL_POSITION")
nat_cols = [r[0] for r in cur.fetchall()]
print("\nNationality columns:", nat_cols)

cur.execute("SELECT TOP 5 * FROM Nationality")
for row in cur.fetchall():
    print(f"  {dict(zip(nat_cols, row))}")

# Check Firestore nationalities collection
print("\n--- Checking Firestore nationalities ---")
import firebase_admin
from firebase_admin import credentials, firestore
if not firebase_admin._apps:
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)
db = firestore.client()
nats = db.collection("nationalities").limit(5).get()
print(f"Firestore nationalities count (sample): {len(nats)}")
for n in nats:
    d = n.to_dict()
    print(f"  {d}")

conn.close()

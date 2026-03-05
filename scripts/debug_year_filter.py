import pyodbc
import firebase_admin
from firebase_admin import credentials, firestore
import os

# SQL Server check
conn = pyodbc.connect(
    r"DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\SQLEXPRESS;"
    r"DATABASE=_bak_import_temp;Trusted_Connection=yes"
)
c = conn.cursor()
c.execute("SELECT COUNT(DISTINCT Student_Number) FROM Registration WHERE Academic_Year = '25-26'")
print("SQL: Distinct students in 25-26:", c.fetchone()[0])
c.execute("SELECT COUNT(*) FROM Registration WHERE Academic_Year = '25-26'")
print("SQL: Total registrations in 25-26:", c.fetchone()[0])
c.execute("SELECT TOP 3 Student_Number FROM Registration WHERE Academic_Year = '25-26'")
print("SQL: Sample student numbers:", [r[0] for r in c.fetchall()])
conn.close()

# Firestore check
KEY_PATH = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")
if not firebase_admin._apps:
    cred = credentials.Certificate(KEY_PATH)
    firebase_admin.initialize_app(cred)
db = firestore.client()

# Check registrations filtered by 25-26
from google.cloud.firestore_v1.base_query import FieldFilter
q = db.collection("registrations").where(filter=FieldFilter("Academic_Year", "==", "25-26")).limit(5)
docs = q.get()
print(f"\nFirestore: registrations where Academic_Year=='25-26': found {len(docs)}")
for d in docs[:3]:
    data = d.to_dict()
    print(f"  Student_Number={data.get('Student_Number')}, Academic_Year={data.get('Academic_Year')} (type={type(data.get('Academic_Year')).__name__})")

# Try numeric
q2 = db.collection("registrations").where(filter=FieldFilter("Academic_Year", "==", 2526)).limit(5)
docs2 = q2.get()
print(f"Firestore: registrations where Academic_Year==2526 (int): found {len(docs2)}")

# Check total registrations count
count_result = db.collection("registrations").count().get()
print(f"\nFirestore: Total registrations: {count_result[0][0].value}")

# Check students count
count_result2 = db.collection("students").count().get()
print(f"Firestore: Total students: {count_result2[0][0].value}")

# Sample a student to check Student_Number format
sdoc = db.collection("students").limit(1).get()[0].to_dict()
print(f"Sample student: Student_Number={sdoc.get('Student_Number')} (type={type(sdoc.get('Student_Number')).__name__})")

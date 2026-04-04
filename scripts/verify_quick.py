"""Quick SQL vs Firestore comparison."""
import pyodbc, firebase_admin, os
from firebase_admin import credentials, firestore

conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    r"SERVER=localhost\SQLEXPRESS;DATABASE=_bak_import_temp;Trusted_Connection=yes;"
)
cur = conn.cursor()

cur.execute("SELECT COUNT(DISTINCT TABLE_NAME) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'")
total_tables = cur.fetchone()[0]

cur.execute("SELECT COUNT(*) FROM Student")
total_students = cur.fetchone()[0]

cur.execute("""
    SELECT COUNT(DISTINCT g.Student_Number)
    FROM Grades g
    JOIN Registration r ON g.Student_Number = r.Student_Number AND g.Academic_Year = r.Academic_Year
    WHERE g.Grade IS NOT NULL
      AND g.Exam_Code IN ('01','04','05','06','09','10','11','12','13','14')
      AND r.Termination_Date IS NULL
""")
pipeline_eligible = cur.fetchone()[0]

cur.execute("SELECT COUNT(*) FROM Family WHERE Family_UserName IS NOT NULL AND Family_Password IS NOT NULL")
families_with_creds = cur.fetchone()[0]

cur.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME")
all_tables = [r.TABLE_NAME for r in cur.fetchall()]
conn.close()

# Firestore
if not firebase_admin._apps:
    cred = credentials.Certificate(os.path.join(os.path.dirname(__file__), "serviceAccountKey.json"))
    firebase_admin.initialize_app(cred)
db = firestore.client()

sp_count = len(db.collection("student_progress").get())
fam_count = len(db.collection("families").get())
stu_count = len(db.collection("students").get())
pc_count = len(db.collection("parent_config").get())

EMBEDDED = {"Student", "Family_Children", "Family", "Registration", "Student_Previous_School", "Sponsor"}
QUERIED = {"Grades", "Subject", "Class", "Section", "Charge_Type", "Student_Charges", "Nationality", "Class_Subjects", "tbOtherIds"}
all_ref = EMBEDDED | QUERIED
not_uploaded = [t for t in all_tables if t not in all_ref]

print("=" * 60)
print("SQL vs FIRESTORE COMPARISON")
print("=" * 60)
print(f"SQL total base tables:         {total_tables}")
print(f"SQL total Student rows:        {total_students:,}")
print(f"SQL pipeline-eligible:         {pipeline_eligible:,}")
print(f"SQL families w/ credentials:   {families_with_creds:,}")
print()
print(f"Firestore student_progress:    {sp_count:,}")
print(f"Firestore families:            {fam_count:,}")
print(f"Firestore students (old coll): {stu_count:,}")
print(f"Firestore parent_config docs:  {pc_count}")
print()

if sp_count >= pipeline_eligible:
    print(f"student_progress: OK (Firestore {sp_count} >= SQL {pipeline_eligible})")
else:
    print(f"student_progress: INCOMPLETE (Firestore {sp_count} < SQL {pipeline_eligible}, missing {pipeline_eligible - sp_count})")

print()
print(f"Tables embedded as raw_* fields:  {len(EMBEDDED)} of {total_tables}")
print(f"Tables queried/transformed:       {len(QUERIED)} of {total_tables}")
print(f"Tables NOT uploaded at all:        {len(not_uploaded)} of {total_tables}")
print()
print("--- Tables NOT in Firestore (not referenced by pipeline) ---")
for t in not_uploaded:
    print(f"  - {t}")
print()
print("Done.")

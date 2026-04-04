"""
verify_completeness.py
Compares SQL Server BAK data counts against Firestore to verify pipeline completeness.
"""
import pyodbc
import firebase_admin
from firebase_admin import credentials, firestore
import os

SERVER = r"localhost\SQLEXPRESS"
TEMP_DB = "_bak_import_temp"
KEY_PATH = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")

# ── SQL Server ──
print("=" * 70)
print("PART 1: SQL Server (_bak_import_temp) — Source Data Counts")
print("=" * 70)

conn = pyodbc.connect(
    f"DRIVER={{ODBC Driver 17 for SQL Server}};"
    f"SERVER={SERVER};DATABASE={TEMP_DB};Trusted_Connection=yes;"
)
cur = conn.cursor()

# List ALL user tables with row counts
cur.execute("""
    SELECT t.TABLE_NAME,
           p.rows AS row_count
    FROM INFORMATION_SCHEMA.TABLES t
    JOIN sys.partitions p
      ON OBJECT_ID(t.TABLE_SCHEMA + '.' + t.TABLE_NAME) = p.object_id
      AND p.index_id IN (0, 1)
    WHERE t.TABLE_TYPE = 'BASE TABLE'
    ORDER BY p.rows DESC
""")
sql_tables = {}
print(f"\n{'Table':<40} {'Rows':>10}")
print("-" * 52)
for r in cur.fetchall():
    name = r.TABLE_NAME
    cnt = r.row_count
    sql_tables[name] = cnt
    print(f"  {name:<38} {cnt:>10,}")
print(f"\n  TOTAL TABLES: {len(sql_tables)}")
print(f"  TOTAL ROWS:   {sum(sql_tables.values()):,}")

# Key counts for pipeline comparison
print("\n--- Key Pipeline Source Counts ---")
cur.execute("SELECT COUNT(*) FROM Student")
total_students = cur.fetchone()[0]
print(f"  Student table rows:           {total_students:,}")

cur.execute("SELECT COUNT(*) FROM Student WHERE Family_Number IS NOT NULL")
students_with_family = cur.fetchone()[0]
print(f"  Students with family link:    {students_with_family:,}")

cur.execute("SELECT COUNT(DISTINCT Student_Number) FROM Grades WHERE Grade IS NOT NULL")
students_with_grades = cur.fetchone()[0]
print(f"  Students with grades:         {students_with_grades:,}")

cur.execute("SELECT COUNT(DISTINCT Student_Number) FROM Registration WHERE Termination_Date IS NULL")
active_regs = cur.fetchone()[0]
print(f"  Students with active reg:     {active_regs:,}")

cur.execute("""
    SELECT COUNT(DISTINCT g.Student_Number)
    FROM Grades g
    JOIN Registration r ON g.Student_Number = r.Student_Number AND g.Academic_Year = r.Academic_Year
    WHERE g.Grade IS NOT NULL
      AND g.Exam_Code IN ('01','04','05','06','09','10','11','12','13','14')
      AND r.Termination_Date IS NULL
""")
pipeline_eligible = cur.fetchone()[0]
print(f"  Pipeline-eligible students:   {pipeline_eligible:,}")

cur.execute("SELECT COUNT(*) FROM Family WHERE Family_UserName IS NOT NULL AND Family_Password IS NOT NULL")
families_with_creds = cur.fetchone()[0]
print(f"  Families with credentials:    {families_with_creds:,}")

cur.execute("SELECT COUNT(*) FROM Family_Children")
total_children = cur.fetchone()[0]
print(f"  Family_Children rows:         {total_children:,}")

cur.execute("SELECT COUNT(*) FROM Family")
total_families = cur.fetchone()[0]
print(f"  Family table rows:            {total_families:,}")

cur.execute("SELECT COUNT(*) FROM Registration")
total_regs = cur.fetchone()[0]
print(f"  Registration table rows:      {total_regs:,}")

cur.execute("SELECT COUNT(*) FROM Grades")
total_grades = cur.fetchone()[0]
print(f"  Grades table rows:            {total_grades:,}")

cur.execute("SELECT COUNT(*) FROM Student_Charges")
total_charges = cur.fetchone()[0]
print(f"  Student_Charges rows:         {total_charges:,}")

# Also check views
cur.execute("""
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS ORDER BY TABLE_NAME
""")
views = [r.TABLE_NAME for r in cur.fetchall()]
print(f"\n  Views: {len(views)}")
for v in views:
    print(f"    - {v}")

conn.close()

# ── Firestore ──
print("\n" + "=" * 70)
print("PART 2: Firestore — Uploaded Data Counts")
print("=" * 70)

if not firebase_admin._apps:
    cred = credentials.Certificate(KEY_PATH)
    firebase_admin.initialize_app(cred)
db = firestore.client()

# Count docs in each collection
collections_to_check = ["student_progress", "families", "students", "parent_config"]
for col_name in collections_to_check:
    docs = db.collection(col_name).get()
    count = len(docs)
    print(f"  {col_name}: {count:,} documents")
    
    # For parent_config, show document IDs
    if col_name == "parent_config":
        for d in docs:
            print(f"    - {d.id}")

# Check a sample student_progress doc to see what fields are present
print("\n--- Sample student_progress document structure ---")
sample_docs = db.collection("student_progress").limit(1).get()
if sample_docs:
    sample = sample_docs[0].to_dict()
    print(f"  Doc ID: {sample_docs[0].id}")
    print(f"  Top-level keys: {sorted(sample.keys())}")
    if "years" in sample:
        years = sample["years"]
        print(f"  Years present: {sorted(years.keys())}")
        if years:
            yr = next(iter(years))
            yr_data = years[yr]
            print(f"  Year '{yr}' keys: {sorted(yr_data.keys())}")
    if "raw_student" in sample:
        print(f"  raw_student keys: {sorted(sample['raw_student'].keys())}")
    if "raw_family" in sample:
        print(f"  raw_family keys: {sorted(sample['raw_family'].keys())}")
    if "raw_family_child" in sample:
        print(f"  raw_family_child keys: {sorted(sample['raw_family_child'].keys())}")
    if "raw_registrations" in sample:
        print(f"  raw_registrations years: {sorted(sample['raw_registrations'].keys())}")
    if "raw_prev_school" in sample:
        ps = sample["raw_prev_school"]
        print(f"  raw_prev_school: {'present' if ps else 'empty'}")
    if "raw_sponsors" in sample:
        print(f"  raw_sponsors years: {sorted(sample['raw_sponsors'].keys())}")
    if "financials" in sample:
        print(f"  financials years: {sorted(sample['financials'].keys())}")

# ── Comparison Summary ──
print("\n" + "=" * 70)
print("PART 3: Comparison & Verdict")
print("=" * 70)

# Re-read Firestore counts
sp_count = len(db.collection("student_progress").get())
fam_count = len(db.collection("families").get())

print(f"\n  SQL pipeline-eligible students:  {pipeline_eligible:,}")
print(f"  Firestore student_progress:     {sp_count:,}")
match_sp = "MATCH" if sp_count == pipeline_eligible else f"MISMATCH (delta={pipeline_eligible - sp_count})"
print(f"  → {match_sp}")

print(f"\n  SQL families with credentials:  {families_with_creds:,}")
print(f"  Firestore families:             {fam_count:,}")
# Note: families count won't match because only families with children who have grades are uploaded
print(f"  (families only uploaded if children have progress data)")

print(f"\n  SQL total tables:               {len(sql_tables)}")
print(f"  Tables NOT in Firestore at all:")
# Tables whose data is partially embedded in raw_* fields
EMBEDDED_TABLES = {"Student", "Family_Children", "Family", "Registration", "Student_Previous_School", "Sponsor"}
QUERIED_TABLES = {"Grades", "Subject", "Class", "Section", "Charge_Type", "Student_Charges", "Nationality", "Class_Subjects", "tbOtherIds"}
all_referenced = EMBEDDED_TABLES | QUERIED_TABLES
for t in sorted(sql_tables.keys()):
    if t not in all_referenced:
        print(f"    - {t} ({sql_tables[t]:,} rows) — NOT uploaded/referenced")

print(f"\n  Tables embedded as raw_* fields: {sorted(EMBEDDED_TABLES)}")
print(f"  Tables queried (transformed):    {sorted(QUERIED_TABLES)}")

print("\nDone.")

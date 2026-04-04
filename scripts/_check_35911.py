import pyodbc, firebase_admin, os
from firebase_admin import credentials, firestore

conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost\\SQLEXPRESS;"
    "DATABASE=_bak_import_temp;"
    "Trusted_Connection=yes"
)
c = conn.cursor()

# Try different ID formats
for sn in ["0021-35911", "0021-359-11", "0021-035911", "0021-0359-11"]:
    c.execute("SELECT Student_Number, Family_Number, Child_Number FROM Student WHERE Student_Number = ?", sn)
    r = c.fetchone()
    if r:
        print(f"Found student: {sn} -> Family={r.Family_Number}, Child={r.Child_Number}")
        break
else:
    # Search with LIKE
    c.execute("SELECT Student_Number, Family_Number, Child_Number FROM Student WHERE Student_Number LIKE '%35911%'")
    rows = c.fetchall()
    print(f"LIKE search for '%35911%': {len(rows)} matches")
    for r in rows:
        print(f"  {r.Student_Number} -> Family={r.Family_Number}, Child={r.Child_Number}")

# Check all registrations for this student
print("\n--- Registration history ---")
c.execute("""
    SELECT r.Academic_Year, r.Class_Code, r.Section_Code, r.Major_Code, cl.E_Class_Desc
    FROM Registration r
    LEFT JOIN Class cl ON r.Class_Code = cl.Class_Code
    WHERE r.Student_Number LIKE '%35911%'
    ORDER BY r.Academic_Year
""")
for r in c.fetchall():
    print(f"  {r.Academic_Year}: {r.E_Class_Desc} (class={r.Class_Code}) Section {r.Section_Code} Major {r.Major_Code}")

# Check grades
print("\n--- Grades history ---")
c.execute("""
    SELECT DISTINCT g.Academic_Year, g.Exam_Code
    FROM Grades g
    WHERE g.Student_Number LIKE '%35911%'
    ORDER BY g.Academic_Year
""")
for r in c.fetchall():
    print(f"  {r.Academic_Year}: Exam {r.Exam_Code}")

# Check Firestore
print("\n--- Firestore student_progress ---")
if not firebase_admin._apps:
    cred = credentials.Certificate(os.path.join(os.path.dirname(__file__), "serviceAccountKey.json"))
    firebase_admin.initialize_app(cred)
db = firestore.client()

# Try different doc IDs
for doc_id in ["0021-35911", "0021-035911", "0021-359-11", "0021-0359-11"]:
    doc = db.collection("student_progress").document(doc_id).get()
    if doc.exists:
        data = doc.to_dict()
        print(f"Found doc: {doc_id}")
        print(f"  student_name: {data.get('student_name')}")
        print(f"  Years present: {sorted(data.get('years', {}).keys())}")
        for yr in sorted(data.get('years', {}).keys()):
            yd = data['years'][yr]
            print(f"    {yr}: {yd.get('class_name')} / {yd.get('section_name')} / avg={yd.get('overall_avg')}")
        break
else:
    # Search by partial match
    print("Doc not found by exact ID, searching...")
    for d in db.collection("student_progress").limit(6000).stream():
        if "35911" in d.id:
            data = d.to_dict()
            print(f"Found: {d.id} -> {data.get('student_name')}")
            print(f"  Years: {sorted(data.get('years', {}).keys())}")
            for yr in sorted(data.get('years', {}).keys()):
                yd = data['years'][yr]
                print(f"    {yr}: {yd.get('class_name')} / {yd.get('section_name')} / avg={yd.get('overall_avg')}")

conn.close()

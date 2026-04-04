import pyodbc

conn = pyodbc.connect(
    'DRIVER={ODBC Driver 17 for SQL Server};'
    'SERVER=localhost\\SQLEXPRESS;'
    'DATABASE=_bak_import_temp;'
    'Trusted_Connection=yes'
)
cursor = conn.cursor()

# ==== Query 1: All tables ====
print("=" * 60)
print("QUERY 1: ALL TABLES IN DATABASE")
print("=" * 60)
cursor.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME")
for r in cursor.fetchall():
    print(r[0])

# ==== Query 2: Amina's grades ====
print("\n" + "=" * 60)
print("QUERY 2: AMINA'S STUDENT NUMBER AND GRADES")
print("=" * 60)
cursor.execute("SELECT Student_Number FROM Student WHERE Family_Number='0021-3183' AND Child_Number=1")
row = cursor.fetchone()
if row:
    sn = row[0]
    print(f"Amina Student_Number: {sn}")
else:
    print("Student not found!")
    sn = None

# Grades columns
print("\n=== Grades Columns ===")
cursor.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Grades' ORDER BY ORDINAL_POSITION")
for r in cursor.fetchall():
    print(r[0])

if sn:
    print("\n=== Amina's Grades for 24-25 ===")
    cursor.execute(
        "SELECT g.*, sub.E_Subject_Name FROM Grades g "
        "JOIN Subject sub ON g.Subject_Code=sub.Subject_Code "
        f"WHERE g.Student_Number='{sn}' AND g.Academic_Year='24-25' "
        "ORDER BY sub.E_Subject_Name, g.Exam_Code"
    )
    cols = [c[0] for c in cursor.description]
    print(' | '.join(cols))
    print('-' * 120)
    for r in cursor.fetchall():
        print(' | '.join(str(v) for v in r))

# ==== Query 3: Distinct Exam_Codes ====
print("\n" + "=" * 60)
print("QUERY 3: DISTINCT EXAM CODES IN GRADES")
print("=" * 60)
cursor.execute("SELECT DISTINCT Exam_Code FROM Grades ORDER BY Exam_Code")
for r in cursor.fetchall():
    print(r[0])

# ==== Query 4: Credit/Hour/Weight columns ====
print("\n" + "=" * 60)
print("QUERY 4: CREDIT/HOUR/WEIGHT COLUMNS ACROSS ALL TABLES")
print("=" * 60)
cursor.execute("""
    SELECT TABLE_NAME, COLUMN_NAME 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE COLUMN_NAME LIKE '%credit%' 
       OR COLUMN_NAME LIKE '%hour%' 
       OR COLUMN_NAME LIKE '%weight%'
    ORDER BY TABLE_NAME, COLUMN_NAME
""")
results = cursor.fetchall()
if results:
    for r in results:
        print(f"{r[0]}.{r[1]}")
else:
    print("No columns found matching credit/hour/weight")

# ==== Query 5: Section_Avg columns ====
print("\n" + "=" * 60)
print("QUERY 5: SECTION_AVG COLUMNS")
print("=" * 60)
cursor.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='Section_Avg'")
if cursor.fetchone():
    cursor.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Section_Avg' ORDER BY ORDINAL_POSITION")
    for r in cursor.fetchall():
        print(r[0])
else:
    print("Section_Avg table does not exist")

# ==== Query 6: Subject/Credit/Curriculum tables ====
print("\n" + "=" * 60)
print("QUERY 6: SUBJECT/CREDIT/CURRICULUM/HOUR TABLES")
print("=" * 60)
cursor.execute("""
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_TYPE='BASE TABLE' 
    AND (TABLE_NAME LIKE '%Subject%' OR TABLE_NAME LIKE '%Credit%' 
         OR TABLE_NAME LIKE '%Curriculum%' OR TABLE_NAME LIKE '%Hour%')
    ORDER BY TABLE_NAME
""")
for r in cursor.fetchall():
    print(r[0])

# ==== Query 7: Amina's Family_Children record ====
print("\n" + "=" * 60)
print("QUERY 7: AMINA'S FAMILY_CHILDREN RECORD")
print("=" * 60)
cursor.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='Family_Children'")
if cursor.fetchone():
    cursor.execute("SELECT * FROM Family_Children WHERE Family_Number='0021-3183' AND Child_Number=1")
    cols = [c[0] for c in cursor.description]
    vals = cursor.fetchone()
    if vals:
        for c, v in zip(cols, vals):
            print(f"{c}: {v}")
    else:
        print("No record found")
else:
    print("Family_Children table does not exist")

# ==== Query 8: Amina's Student record ====
print("\n" + "=" * 60)
print("QUERY 8: AMINA'S FULL STUDENT RECORD")
print("=" * 60)
cursor.execute("SELECT * FROM Student WHERE Family_Number='0021-3183' AND Child_Number=1")
cols = [c[0] for c in cursor.description]
vals = cursor.fetchone()
if vals:
    for c, v in zip(cols, vals):
        print(f"{c}: {v}")
else:
    print("No record found")

conn.close()
print("\n" + "=" * 60)
print("ALL QUERIES COMPLETE")
print("=" * 60)

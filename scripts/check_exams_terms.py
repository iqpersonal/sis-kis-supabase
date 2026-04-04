import pyodbc

conn = pyodbc.connect('DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\\SQLEXPRESS;DATABASE=_bak_import_temp;Trusted_Connection=yes')
cursor = conn.cursor()

# 1. Exams table structure and data
print("=" * 60)
print("1. EXAMS TABLE")
print("=" * 60)
cursor.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Exams' ORDER BY ORDINAL_POSITION")
print("=== Exams Columns ===")
for r in cursor.fetchall():
    print(r[0])

cursor.execute("SELECT * FROM Exams ORDER BY Exam_Code")
cols = [c[0] for c in cursor.description]
print("\n" + " | ".join(cols))
print("-" * 80)
for r in cursor.fetchall():
    print(" | ".join(str(v) for v in r))

# 2. Amina's registration for 24-25
print("\n" + "=" * 60)
print("2. AMINA'S REGISTRATION (24-25)")
print("=" * 60)
cursor.execute("SELECT * FROM Registration WHERE Student_Number='0021-318311' AND Academic_Year='24-25'")
cols = [c[0] for c in cursor.description]
vals = cursor.fetchone()
if vals:
    for c, v in zip(cols, vals):
        print(f"  {c}: {v}")
else:
    print("  No registration found")

# 3. Class_Subjects for Amina's class
print("\n" + "=" * 60)
print("3. CLASS_SUBJECTS FOR AMINA'S CLASS")
print("=" * 60)
cursor.execute("SELECT Major_Code, Group_Code, Class_Code FROM Registration WHERE Student_Number='0021-318311' AND Academic_Year='24-25'")
reg = cursor.fetchone()
print(f"Major: {reg[0]}, Group: {reg[1]}, Class: {reg[2]}")

cursor.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Class_Subjects' ORDER BY ORDINAL_POSITION")
print("\n=== Class_Subjects Columns ===")
for r in cursor.fetchall():
    print(r[0])

cursor.execute(f"""SELECT cs.*, sub.E_Subject_Name, sub.A_Subject_Name 
    FROM Class_Subjects cs 
    JOIN Subject sub ON cs.Subject_Code = sub.Subject_Code 
    WHERE cs.Major_Code='{reg[0]}' AND cs.Group_Code='{reg[1]}' AND cs.Class_Code='{reg[2]}' 
    ORDER BY sub.E_Subject_Name""")
cols = [c[0] for c in cursor.description]
print("\n" + " | ".join(cols))
print("-" * 120)
for r in cursor.fetchall():
    print(" | ".join(str(v) for v in r))

# 4. Class_Exams for Amina's class
print("\n" + "=" * 60)
print("4. CLASS_EXAMS FOR AMINA'S CLASS")
print("=" * 60)
cursor.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Class_Exams' ORDER BY ORDINAL_POSITION")
print("=== Class_Exams Columns ===")
for r in cursor.fetchall():
    print(r[0])

cursor.execute("SELECT Major_Code, Group_Code, Class_Code FROM Registration WHERE Student_Number='0021-318311' AND Academic_Year='24-25'")
reg = cursor.fetchone()
cursor.execute(f"""SELECT ce.*, e.E_Exam_Name, e.A_Exam_Name 
    FROM Class_Exams ce 
    LEFT JOIN Exams e ON ce.Exam_Code = e.Exam_Code
    WHERE ce.Major_Code='{reg[0]}' AND ce.Group_Code='{reg[1]}' AND ce.Class_Code='{reg[2]}' 
    ORDER BY ce.Exam_Code""")
cols = [c[0] for c in cursor.description]
print("\n" + " | ".join(cols))
print("-" * 120)
for r in cursor.fetchall():
    print(" | ".join(str(v) for v in r))

# 5. Terms table
print("\n" + "=" * 60)
print("5. TERMS TABLE")
print("=" * 60)
try:
    cursor.execute("SELECT * FROM Terms ORDER BY 1")
    cols = [c[0] for c in cursor.description]
    print(" | ".join(cols))
    print("-" * 80)
    for r in cursor.fetchall():
        print(" | ".join(str(v) for v in r))
except Exception as e:
    print(f"No Terms table: {e}")

# 6. Nationality 747
print("\n" + "=" * 60)
print("6. NATIONALITY CODE 747")
print("=" * 60)
cursor.execute("SELECT * FROM Nationality WHERE Nationality_Code='747'")
cols = [c[0] for c in cursor.description]
vals = cursor.fetchone()
if vals:
    for c, v in zip(cols, vals):
        print(f"  {c}: {v}")
else:
    print("  Not found")

# 7. Exam code details - focus on 04, 05, 09, 10, 11
print("\n" + "=" * 60)
print("7. EXAM CODE DETAILS (04, 05, 09, 10, 11)")
print("=" * 60)
cursor.execute("SELECT * FROM Exams WHERE Exam_Code IN ('04','05','09','10','11') ORDER BY Exam_Code")
cols = [c[0] for c in cursor.description]
print(" | ".join(cols))
print("-" * 80)
for r in cursor.fetchall():
    print(" | ".join(str(v) for v in r))

# Also show Amina's actual exam marks to cross-reference
print("\n=== Amina's Marks by Exam Code ===")
cursor.execute("""SELECT m.Exam_Code, e.E_Exam_Name, e.A_Exam_Name, COUNT(*) as subject_count, 
    MIN(m.Mark) as min_mark, MAX(m.Mark) as max_mark, AVG(CAST(m.Mark as float)) as avg_mark
    FROM Marks m 
    LEFT JOIN Exams e ON m.Exam_Code = e.Exam_Code
    WHERE m.Student_Number='0021-318311' AND m.Academic_Year='24-25'
    GROUP BY m.Exam_Code, e.E_Exam_Name, e.A_Exam_Name
    ORDER BY m.Exam_Code""")
cols = [c[0] for c in cursor.description]
print(" | ".join(cols))
print("-" * 100)
for r in cursor.fetchall():
    print(" | ".join(str(v) for v in r))

conn.close()
print("\n=== DONE ===")

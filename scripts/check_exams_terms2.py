import pyodbc

conn = pyodbc.connect('DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\\SQLEXPRESS;DATABASE=_bak_import_temp;Trusted_Connection=yes')
cursor = conn.cursor()

# 4. Class_Exams for Amina's class
print("=" * 60)
print("4. CLASS_EXAMS FOR AMINA'S CLASS")
print("=" * 60)

cursor.execute("SELECT Major_Code, Group_Code, Class_Code FROM Registration WHERE Student_Number='0021-318311' AND Academic_Year='24-25'")
reg = cursor.fetchone()

cursor.execute(f"""SELECT ce.*, e.E_Exam_Desc, e.A_Exam_Desc 
    FROM Class_Exams ce 
    LEFT JOIN Exams e ON ce.Exam_Code = e.Exam_Code
    WHERE ce.Major_Code='{reg[0]}' AND ce.Group_Code='{reg[1]}' AND ce.Class_Code='{reg[2]}' 
    ORDER BY ce.Academic_Year, ce.Exam_Code""")
cols = [c[0] for c in cursor.description]
print(" | ".join(cols))
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

# 7. Exam code details
print("\n" + "=" * 60)
print("7. EXAM CODE MAPPING SUMMARY")
print("=" * 60)
cursor.execute("SELECT Exam_Code, E_Exam_Desc, A_Exam_Desc, Sequence, Average FROM Exams ORDER BY Sequence")
print(f"{'Code':<6} {'E_Desc':<30} {'A_Desc':<30} {'Seq':<5} {'IsAvg'}")
print("-" * 80)
for r in cursor.fetchall():
    print(f"{r[0]:<6} {str(r[1]):<30} {str(r[2]):<30} {str(r[3]):<5} {r[4]}")

# Amina's marks summary by exam code
print("\n=== Amina's Marks by Exam Code (24-25) ===")
cursor.execute("""SELECT m.Exam_Code, e.E_Exam_Desc, COUNT(*) as subject_count, 
    MIN(m.Mark) as min_mark, MAX(m.Mark) as max_mark, ROUND(AVG(CAST(m.Mark as float)),1) as avg_mark
    FROM Marks m 
    LEFT JOIN Exams e ON m.Exam_Code = e.Exam_Code
    WHERE m.Student_Number='0021-318311' AND m.Academic_Year='24-25'
    GROUP BY m.Exam_Code, e.E_Exam_Desc
    ORDER BY m.Exam_Code""")
cols = [c[0] for c in cursor.description]
print(" | ".join(cols))
print("-" * 100)
for r in cursor.fetchall():
    print(" | ".join(str(v) for v in r))

# Class_Subjects for 24-25 only - cleaner view
print("\n" + "=" * 60)
print("8. CLASS_SUBJECTS FOR 24-25 ONLY (CLEAN VIEW)")
print("=" * 60)
cursor.execute(f"""SELECT cs.Subject_Code, sub.E_Subject_Name, cs.No_of_Hours, cs.Credits, 
    cs.Coefficient, cs.Maximum_Grade, cs.Pass_Average, cs.Main_Subject, cs.Calculated_Subject
    FROM Class_Subjects cs 
    JOIN Subject sub ON cs.Subject_Code = sub.Subject_Code 
    WHERE cs.Academic_Year='24-25' AND cs.Major_Code='{reg[0]}' AND cs.Group_Code='{reg[1]}' AND cs.Class_Code='{reg[2]}' 
    ORDER BY cs.Subject_Print_Sequence""")
cols = [c[0] for c in cursor.description]
print(" | ".join(cols))
print("-" * 100)
for r in cursor.fetchall():
    print(" | ".join(str(v) for v in r))

# Class_Exams for 24-25 only
print("\n" + "=" * 60)
print("9. CLASS_EXAMS FOR 24-25 ONLY")
print("=" * 60)
cursor.execute(f"""SELECT ce.Exam_Code, e.E_Exam_Desc, ce.Exam_Weight, ce.Sequence, ce.Average, 
    ce.IsPrint, ce.FinalExam, ce.IsTerm, ce.Current_Exam
    FROM Class_Exams ce 
    LEFT JOIN Exams e ON ce.Exam_Code = e.Exam_Code
    WHERE ce.Academic_Year='24-25' AND ce.Major_Code='{reg[0]}' AND ce.Group_Code='{reg[1]}' AND ce.Class_Code='{reg[2]}' 
    ORDER BY ce.Sequence""")
cols = [c[0] for c in cursor.description]
print(" | ".join(cols))
print("-" * 100)
for r in cursor.fetchall():
    print(" | ".join(str(v) for v in r))

conn.close()
print("\n=== DONE ===")

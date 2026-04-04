import pyodbc
conn = pyodbc.connect('DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\\SQLEXPRESS;DATABASE=_bak_import_temp;Trusted_Connection=yes')
cursor = conn.cursor()

# Find tables
cursor.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%ark%' OR TABLE_NAME LIKE '%rade%' OR TABLE_NAME LIKE '%core%' OR TABLE_NAME LIKE '%esult%' OR TABLE_NAME LIKE '%Trans%' ORDER BY TABLE_NAME")
print('Relevant tables:')
for r in cursor.fetchall():
    print(f'  {r[0]}')

# Also check Student tables
cursor.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%Student%' ORDER BY TABLE_NAME")
print('\nStudent tables:')
for r in cursor.fetchall():
    print(f'  {r[0]}')

# Try Student_Marks
for tbl in ['Student_Marks', 'Student_Mark', 'StudentMarks', 'Transcript_Data', 'transcript_data']:
    try:
        cursor.execute(f"SELECT TOP 1 * FROM [{tbl}]")
        cols = [c[0] for c in cursor.description]
        print(f"\nFound table [{tbl}] with columns: {cols}")
        break
    except:
        pass

# Get Amina's marks using the correct table
for tbl in ['Student_Marks', 'Student_Mark', 'Transcript_Data', 'transcript_data']:
    try:
        cursor.execute(f"SELECT TOP 5 * FROM [{tbl}] WHERE Student_Number='0021-318311' AND Academic_Year='24-25'")
        cols = [c[0] for c in cursor.description]
        rows = cursor.fetchall()
        if rows:
            print(f"\nAmina's marks from [{tbl}]:")
            print(" | ".join(cols))
            for r in rows:
                print(" | ".join(str(v) for v in r))
            
            # Now do the summary
            cursor.execute(f"""SELECT m.Exam_Code, e.E_Exam_Desc, COUNT(*) as subject_count, 
                MIN(m.Mark) as min_mark, MAX(m.Mark) as max_mark, ROUND(AVG(CAST(m.Mark as float)),1) as avg_mark
                FROM [{tbl}] m 
                LEFT JOIN Exams e ON m.Exam_Code = e.Exam_Code
                WHERE m.Student_Number='0021-318311' AND m.Academic_Year='24-25'
                GROUP BY m.Exam_Code, e.E_Exam_Desc
                ORDER BY m.Exam_Code""")
            print(f"\nAmina's Marks Summary by Exam Code (24-25):")
            cols2 = [c[0] for c in cursor.description]
            print(" | ".join(cols2))
            for r in cursor.fetchall():
                print(" | ".join(str(v) for v in r))
            break
    except Exception as ex:
        print(f"  [{tbl}] error: {ex}")

# Class_Subjects for 24-25 only - cleaner view
print("\n" + "=" * 60)
print("CLASS_SUBJECTS FOR 24-25 ONLY (CLEAN VIEW)")
print("=" * 60)
cursor.execute("SELECT Major_Code, Group_Code, Class_Code FROM Registration WHERE Student_Number='0021-318311' AND Academic_Year='24-25'")
reg = cursor.fetchone()
cursor.execute(f"""SELECT cs.Subject_Code, sub.E_Subject_Name, cs.No_of_Hours, cs.Credits, 
    cs.Coefficient, cs.Maximum_Grade, cs.Pass_Average, cs.Main_Subject, cs.Calculated_Subject
    FROM Class_Subjects cs 
    JOIN Subject sub ON cs.Subject_Code = sub.Subject_Code 
    WHERE cs.Academic_Year='24-25' AND cs.Major_Code='{reg[0]}' AND cs.Group_Code='{reg[1]}' AND cs.Class_Code='{reg[2]}' 
    ORDER BY cs.Subject_Print_Sequence""")
cols = [c[0] for c in cursor.description]
print(" | ".join(cols))
print("-" * 120)
for r in cursor.fetchall():
    print(" | ".join(str(v) for v in r))

# Class_Exams for 24-25 only
print("\n" + "=" * 60)
print("CLASS_EXAMS FOR 24-25 ONLY")
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

import pyodbc
conn = pyodbc.connect('DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\\SQLEXPRESS;DATABASE=_bak_import_temp;Trusted_Connection=yes')
c = conn.cursor()

c.execute("""SELECT g.Exam_Code, e.E_Exam_Desc, COUNT(*) as cnt, 
    MIN(g.Grade) as min_grade, MAX(g.Grade) as max_grade, ROUND(AVG(CAST(g.Grade as float)),1) as avg_grade
    FROM Grades g 
    LEFT JOIN Exams e ON g.Exam_Code = e.Exam_Code
    WHERE g.Student_Number = '0021-318311' AND g.Academic_Year = '24-25'
    GROUP BY g.Exam_Code, e.E_Exam_Desc
    ORDER BY g.Exam_Code""")
print("Amina's Grades Summary by Exam Code (24-25):")
print(f"{'Exam_Code':<12} {'E_Exam_Desc':<25} {'Count':<7} {'Min':<8} {'Max':<8} {'Avg'}")
print("-" * 80)
for r in c.fetchall():
    print(f"{r[0]:<12} {str(r[1]):<25} {r[2]:<7} {str(r[3]):<8} {str(r[4]):<8} {r[5]}")

conn.close()

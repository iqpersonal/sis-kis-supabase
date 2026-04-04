import pyodbc
conn = pyodbc.connect('DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\\SQLEXPRESS;DATABASE=_bak_import_temp;Trusted_Connection=yes')
c = conn.cursor()

# Check Grades columns
c.execute("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Grades' ORDER BY ORDINAL_POSITION")
print("Grades columns:")
for r in c.fetchall():
    print(f"  {r[0]} ({r[1]})")

# Check what Student_Number looks like in Grades
c.execute("SELECT TOP 3 Student_Number FROM Grades")
print("\nSample Student_Number in Grades:")
for r in c.fetchall():
    print(f"  {r[0]}")

# Try with proper column
c.execute("SELECT TOP 1 * FROM Grades")
cols = [x[0] for x in c.description]
row = c.fetchone()
print(f"\nGrades sample row:")
for cn, v in zip(cols, row):
    print(f"  {cn}: {v}")

# Get Amina's grades - the Student_Number field might be numeric
# Her number is 0021-318311
# Strip possible prefix
c.execute("SELECT TOP 5 * FROM Grades WHERE Student_Number = 318311 AND Academic_Year = '24-25'")
rows = c.fetchall()
if not rows:
    c.execute("SELECT TOP 5 * FROM Grades WHERE Student_Number = 318311")
    rows = c.fetchall()
    
if rows:
    cols = [x[0] for x in c.description]
    print(f"\nAmina Grades found ({len(rows)} rows):")
    for row in rows:
        print(" | ".join(str(v) for v in row))
else:
    print("\nNo grades found for 318311")

# Try summary
try:
    c.execute("""SELECT g.Exam_Code, e.E_Exam_Desc, COUNT(*) as cnt, 
        MIN(g.Mark) as min_mark, MAX(g.Mark) as max_mark, ROUND(AVG(CAST(g.Mark as float)),1) as avg_mark
        FROM Grades g 
        LEFT JOIN Exams e ON g.Exam_Code = e.Exam_Code
        WHERE g.Student_Number = 318311 AND g.Academic_Year = '24-25'
        GROUP BY g.Exam_Code, e.E_Exam_Desc
        ORDER BY g.Exam_Code""")
    print("\nAmina's Marks Summary by Exam Code (24-25):")
    cols = [x[0] for x in c.description]
    print(" | ".join(cols))
    for r in c.fetchall():
        print(" | ".join(str(v) for v in r))
except Exception as ex:
    print(f"Summary query error: {ex}")
    # Maybe Mark column has different name
    c.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Grades' AND COLUMN_NAME LIKE '%ark%' OR (TABLE_NAME='Grades' AND COLUMN_NAME LIKE '%rade%') ORDER BY ORDINAL_POSITION")
    print("Mark-like columns in Grades:")
    for r in c.fetchall():
        print(f"  {r[0]}")

conn.close()

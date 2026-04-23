import pyodbc

conn = pyodbc.connect(r'DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\SQLEXPRESS;DATABASE=_bak_import_temp;Trusted_Connection=yes;')
cursor = conn.cursor()

cursor.execute("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tbl_Quiz_Grades' ORDER BY ORDINAL_POSITION")
print('=== tbl_Quiz_Grades Columns ===')
for r in cursor.fetchall():
    print(f'  {r.COLUMN_NAME}: {r.DATA_TYPE}')

print()
print('=== Sample rows (25-26, first 20 rows) ===')
cursor.execute("""
    SELECT TOP 20 q.Student_Number, q.Subject_Code, s.E_Subject_Name, q.Exam_Code, q.Quiz_Code,
           q.Grade, q.Max_Grade, q.Academic_Year
    FROM tbl_Quiz_Grades q
    LEFT JOIN Subject s ON q.Subject_Code = s.Subject_Code
    WHERE q.Academic_Year = '25-26'
    ORDER BY q.Student_Number, q.Subject_Code, q.Exam_Code, q.Quiz_Code
""")
for r in cursor.fetchall():
    print(f'  SN={r.Student_Number} Subj={r.E_Subject_Name} Exam={r.Exam_Code} Quiz={r.Quiz_Code} Grade={r.Grade}/{r.Max_Grade}')

print()
print('=== Distinct Quiz_Codes (25-26) ===')
cursor.execute("""
    SELECT q.Quiz_Code, COUNT(*) as cnt
    FROM tbl_Quiz_Grades q
    WHERE q.Academic_Year = '25-26'
    GROUP BY q.Quiz_Code
    ORDER BY q.Quiz_Code
""")
for r in cursor.fetchall():
    print(f'  Quiz_Code={r.Quiz_Code}  count={r.cnt}')

print()
print('=== tbl_Quiz columns ===')
cursor.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tbl_Quiz' ORDER BY ORDINAL_POSITION")
for r in cursor.fetchall():
    print(f'  {r.COLUMN_NAME}')

print()
print('=== tbl_Quiz sample ===')
cursor.execute('SELECT TOP 10 * FROM tbl_Quiz ORDER BY Quiz_Code')
cols = [d[0] for d in cursor.description]
print('  Columns:', cols)
for r in cursor.fetchall():
    print(' ', dict(zip(cols, r)))

conn.close()
print('Done')

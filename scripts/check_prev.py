import pyodbc
conn = pyodbc.connect('DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\\SQLEXPRESS;DATABASE=_bak_import_temp;Trusted_Connection=yes;')
cursor = conn.cursor()

sn = '0021-1448102'

# Check view
cursor.execute("SELECT Student_Number, COALESCE(E_Local_School_Name, E_Foreign_School_Name, '') AS prev_en FROM vwStudentPreviousSchools WHERE Student_Number = ?", sn)
rows = cursor.fetchall()
print(f"vwStudentPreviousSchools rows: {len(rows)}")
for r in rows:
    print(f"  {r}")

# Check raw table
cursor.execute("SELECT * FROM Student_Previous_School WHERE Student_Number = ?", sn)
rows2 = cursor.fetchall()
print(f"Student_Previous_School rows: {len(rows2)}")
for r in rows2:
    print(f"  {r}")

conn.close()

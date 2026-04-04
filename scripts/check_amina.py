import pyodbc
conn = pyodbc.connect('DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\\SQLEXPRESS;DATABASE=_bak_import_temp;Trusted_Connection=yes;')
cursor = conn.cursor()

sn = '0021-318311'

# 1. Registration history
print("=== REGISTRATION HISTORY ===")
cursor.execute("""
    SELECT r.Academic_Year, r.Major_Code, r.Class_Code, r.Section_Code,
           m.E_Major_Desc, c.E_Class_Desc
    FROM Registration r
    LEFT JOIN Major m ON r.Major_Code = m.Major_Code
    LEFT JOIN Class c ON r.Class_Code = c.Class_Code
    WHERE r.Student_Number = ?
    ORDER BY r.Academic_Year
""", sn)
for r in cursor.fetchall():
    print(f"  {r.Academic_Year}: {r.E_Class_Desc} | {r.E_Major_Desc} (Major={r.Major_Code})")

# 2. Previous school records (external)
print("\n=== PREVIOUS SCHOOL (vwStudentPreviousSchools) ===")
cursor.execute("""
    SELECT Academic_Year, Student_Number, 
           COALESCE(E_Local_School_Name, E_Foreign_School_Name, '') AS prev_school_en,
           E_Class_Desc, E_Major_Desc
    FROM vwStudentPreviousSchools 
    WHERE Student_Number = ?
    ORDER BY Academic_Year
""", sn)
rows = cursor.fetchall()
print(f"  Found {len(rows)} rows")
for r in rows:
    print(f"  {r.Academic_Year}: prev_school='{r.prev_school_en}', class={r.E_Class_Desc}, major={r.E_Major_Desc}")

# 3. All prev school records raw
print("\n=== Student_Previous_School RAW ===")
cursor.execute("SELECT * FROM Student_Previous_School WHERE Student_Number = ?", sn)
cols = [c[0] for c in cursor.description]
rows = cursor.fetchall()
print(f"  Found {len(rows)} rows")
for r in rows:
    d = dict(zip(cols, r))
    relevant = {k: v for k, v in d.items() if v is not None and str(v).strip() != ''}
    print(f"  {relevant}")

# 4. Grades years 
print("\n=== GRADES YEARS ===")
cursor.execute("SELECT DISTINCT Academic_Year FROM Grades WHERE Student_Number = ? ORDER BY Academic_Year", sn)
for r in cursor.fetchall():
    print(f"  {r[0]}")

conn.close()

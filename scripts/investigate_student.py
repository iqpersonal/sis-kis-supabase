import pyodbc
conn = pyodbc.connect('DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\\SQLEXPRESS;DATABASE=_bak_import_temp;Trusted_Connection=yes;')
cursor = conn.cursor()

sn = '0021-1448102'

# 1. Check Grades table - shows which years/classes student was enrolled
print("=== GRADES HISTORY (by year) ===")
cursor.execute("""
    SELECT DISTINCT g.Academic_Year, g.Class_Code, g.Section_Code, g.Major_Code
    FROM Grades g
    WHERE g.Student_Number = ?
    ORDER BY g.Academic_Year
""", sn)
for r in cursor.fetchall():
    print(f"  Year: {r.Academic_Year}, Class: {r.Class_Code}, Section: {r.Section_Code}, Major: {r.Major_Code}")

# 2. Check Student table for registration details
print("\n=== STUDENT TABLE ===")
cursor.execute("SELECT * FROM Student WHERE Student_Number = ?", sn)
cols = [c[0] for c in cursor.description]
rows = cursor.fetchall()
for r in rows:
    d = dict(zip(cols, r))
    for k, v in d.items():
        if v is not None and str(v).strip():
            print(f"  {k}: {v}")

# 3. Check Registration table if it exists
print("\n=== REGISTRATION TABLE ===")
try:
    cursor.execute("SELECT * FROM Registration WHERE Student_Number = ?", sn)
    cols = [c[0] for c in cursor.description]
    rows = cursor.fetchall()
    print(f"  Found {len(rows)} rows")
    for r in rows:
        d = dict(zip(cols, r))
        relevant = {k: v for k, v in d.items() if v is not None and str(v).strip()}
        print(f"  {relevant}")
except Exception as e:
    print(f"  Table not found or error: {e}")

# 4. Check Student_Registration if exists
print("\n=== STUDENT_REGISTRATION TABLE ===")
try:
    cursor.execute("SELECT * FROM Student_Registration WHERE Student_Number = ?", sn)
    cols = [c[0] for c in cursor.description]
    rows = cursor.fetchall()
    print(f"  Found {len(rows)} rows")
    for r in rows:
        d = dict(zip(cols, r))
        relevant = {k: v for k, v in d.items() if v is not None and str(v).strip()}
        print(f"  {relevant}")
except Exception as e:
    print(f"  Table not found or error: {e}")

# 5. Check Class_Students for year-by-year enrollment
print("\n=== CLASS_STUDENTS TABLE ===")
try:
    cursor.execute("""
        SELECT * FROM Class_Students 
        WHERE Student_Number = ?
        ORDER BY Academic_Year
    """, sn)
    cols = [c[0] for c in cursor.description]
    rows = cursor.fetchall()
    print(f"  Found {len(rows)} rows")
    for r in rows:
        d = dict(zip(cols, r))
        relevant = {k: v for k, v in d.items() if v is not None and str(v).strip()}
        print(f"  {relevant}")
except Exception as e:
    print(f"  Table not found or error: {e}")

# 6. Look for tables with "Regist" or "Branch" or "Transfer" in name
print("\n=== TABLES WITH REGIST/BRANCH/TRANSFER IN NAME ===")
cursor.execute("""
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_NAME LIKE '%Regist%' OR TABLE_NAME LIKE '%Branch%' OR TABLE_NAME LIKE '%Transfer%'
    ORDER BY TABLE_NAME
""")
for r in cursor.fetchall():
    print(f"  {r[0]}")

# 7. Check Family_Children for this student
print("\n=== FAMILY_CHILDREN ===")
cursor.execute("""
    SELECT fc.Student_Number, fc.Child_id, fc.Major_Code, fc.Academic_Year,
           fc.E_Child_Name, fc.Status_Code
    FROM Family_Children fc
    WHERE fc.Student_Number = ?
    ORDER BY fc.Academic_Year
""", sn)
cols = [c[0] for c in cursor.description]
for r in cursor.fetchall():
    d = dict(zip(cols, r))
    print(f"  {d}")

conn.close()

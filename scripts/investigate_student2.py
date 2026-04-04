import pyodbc
conn = pyodbc.connect('DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\\SQLEXPRESS;DATABASE=_bak_import_temp;Trusted_Connection=yes;')
cursor = conn.cursor()

sn = '0021-1448102'

# Check Grades columns
print("=== GRADES COLUMNS ===")
cursor.execute("SELECT TOP 1 * FROM Grades WHERE Student_Number = ?", sn)
cols = [c[0] for c in cursor.description]
print(cols)

# Get all years from Grades
print("\n=== GRADES HISTORY ===")
cursor.execute("SELECT DISTINCT Academic_Year FROM Grades WHERE Student_Number = ? ORDER BY Academic_Year", sn)
for r in cursor.fetchall():
    print(f"  Year: {r[0]}")

# Check Class_Students columns
print("\n=== CLASS_STUDENTS COLUMNS ===")
try:
    cursor.execute("SELECT TOP 1 * FROM Class_Students")
    cols = [c[0] for c in cursor.description]
    print(cols)
    cursor.execute("SELECT * FROM Class_Students WHERE Student_Number = ? ORDER BY Academic_Year", sn)
    rows = cursor.fetchall()
    print(f"  Found {len(rows)} rows for student")
    for r in rows:
        d = dict(zip(cols, r))
        relevant = {k: v for k, v in d.items() if v is not None and str(v).strip() != ''}
        print(f"  {relevant}")
except Exception as e:
    print(f"  Error: {e}")

# Check Registration tables
print("\n=== TABLES WITH REGIST/BRANCH/TRANSFER ===")
cursor.execute("""
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_NAME LIKE '%Regist%' OR TABLE_NAME LIKE '%Branch%' 
       OR TABLE_NAME LIKE '%Transfer%' OR TABLE_NAME LIKE '%Enroll%'
    ORDER BY TABLE_NAME
""")
for r in cursor.fetchall():
    print(f"  {r[0]}")

# Check Student table
print("\n=== STUDENT TABLE (key fields) ===")
cursor.execute("SELECT TOP 1 * FROM Student WHERE Student_Number = ?", sn)
cols = [c[0] for c in cursor.description]
row = cursor.fetchone()
if row:
    d = dict(zip(cols, row))
    for k in ['Student_Number', 'Major_Code', 'Group_Code', 'Class_Code', 
              'Academic_Year', 'Enrollment_Date', 'Status_Code', 'Status_Date',
              'Branch_Code', 'School_Code']:
        if k in d:
            print(f"  {k}: {d[k]}")
    # Also print any column with 'prev' or 'branch' or 'transfer' or 'school' in name
    for k, v in d.items():
        kl = k.lower()
        if any(w in kl for w in ['prev', 'branch', 'transfer', 'from', 'origin']):
            print(f"  {k}: {v}")

# Check Family_Children
print("\n=== FAMILY_CHILDREN HISTORY ===")
cursor.execute("SELECT TOP 1 * FROM Family_Children")
fc_cols = [c[0] for c in cursor.description]
# Find relevant columns
print(f"  Columns: {fc_cols}")
cursor.execute("SELECT * FROM Family_Children WHERE Student_Number = ?", sn)
rows = cursor.fetchall()
print(f"  Found {len(rows)} rows")
for r in rows:
    d = dict(zip(fc_cols, r))
    relevant = {k: v for k, v in d.items() if v is not None and str(v).strip() != ''}
    print(f"  {relevant}")

conn.close()

import pyodbc
conn = pyodbc.connect('DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\\SQLEXPRESS;DATABASE=_bak_import_temp;Trusted_Connection=yes;')
cursor = conn.cursor()

sn = '0021-1448102'

# 1. Registration table - year by year enrollment
print("=== REGISTRATION TABLE COLUMNS ===")
cursor.execute("SELECT TOP 1 * FROM Registration")
cols = [c[0] for c in cursor.description]
print(cols)

print("\n=== REGISTRATION HISTORY ===")
cursor.execute("SELECT * FROM Registration WHERE Student_Number = ? ORDER BY Academic_Year", sn)
cols = [c[0] for c in cursor.description]
rows = cursor.fetchall()
print(f"Found {len(rows)} rows")
for r in rows:
    d = dict(zip(cols, r))
    print(f"\n  Year: {d.get('Academic_Year')}")
    print(f"  Major_Code: {d.get('Major_Code')}")
    print(f"  Group_Code: {d.get('Group_Code')}")
    print(f"  Class_Code: {d.get('Class_Code')}")
    print(f"  Section_Code: {d.get('Section_Code')}")
    print(f"  Status_Code: {d.get('Status_Code')}")
    print(f"  Registration_Date: {d.get('Registration_Date')}")
    # Print any branch-related columns
    for k, v in d.items():
        kl = k.lower()
        if any(w in kl for w in ['branch', 'transfer', 'prev', 'from', 'school']):
            if v is not None and str(v).strip():
                print(f"  {k}: {v}")

# 2. Also check vw_StudentRegistrationInfo
print("\n=== vw_StudentRegistrationInfo ===")
try:
    cursor.execute("SELECT * FROM vw_StudentRegistrationInfo WHERE Student_Number = ? ORDER BY Academic_Year", sn)
    cols = [c[0] for c in cursor.description]
    rows = cursor.fetchall()
    print(f"Found {len(rows)} rows")
    for r in rows:
        d = dict(zip(cols, r))
        print(f"\n  Year: {d.get('Academic_Year')}, Class: {d.get('E_Class_Desc', d.get('Class_Code'))}")
        print(f"  Major: {d.get('E_Major_Desc', d.get('Major_Code'))}")
        for k, v in d.items():
            kl = k.lower()
            if any(w in kl for w in ['branch', 'school', 'section']):
                if v is not None and str(v).strip():
                    print(f"  {k}: {v}")
except Exception as e:
    print(f"  Error: {e}")

# 3. Check vw_RegisteredStudents
print("\n=== vw_RegisteredStudents ===")
try:
    cursor.execute("SELECT TOP 1 * FROM vw_RegisteredStudents")
    cols = [c[0] for c in cursor.description]
    print(f"Columns: {cols}")
    cursor.execute("SELECT * FROM vw_RegisteredStudents WHERE Student_Number = ? ORDER BY Academic_Year", sn)
    rows = cursor.fetchall()
    print(f"Found {len(rows)} rows")
    for r in rows:
        d = dict(zip(cols, r))
        yr = d.get('Academic_Year', '?')
        cls = d.get('E_Class_Desc', d.get('Class_Code', '?'))
        major = d.get('E_Major_Desc', d.get('Major_Code', '?'))
        branch = d.get('Branch_Code', d.get('E_Branch_Desc', '?'))
        status = d.get('Status_Code', d.get('E_Status_Desc', '?'))
        print(f"  {yr}: Class={cls}, Major={major}, Branch={branch}, Status={status}")
except Exception as e:
    print(f"  Error: {e}")

conn.close()

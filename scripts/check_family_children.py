import pyodbc

conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=.\\SQLEXPRESS;"
    "DATABASE=_bak_import_temp;"
    "Trusted_Connection=yes"
)
cur = conn.cursor()

# Family_Children columns
cur.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Family_Children' ORDER BY ORDINAL_POSITION")
cols = [r[0] for r in cur.fetchall()]
print("Family_Children columns:", cols)

# Sample row
cur.execute("SELECT TOP 3 * FROM Family_Children")
for row in cur.fetchall():
    d = dict(zip(cols, row))
    print("\nSample row:")
    for k, v in d.items():
        if v is not None and str(v).strip():
            print(f"  {k}: {v!r}")

# Count
cur.execute("SELECT COUNT(*) FROM Family_Children")
print(f"\nTotal Family_Children rows: {cur.fetchone()[0]}")

# Check how Student_Number relates - does Family_Children have Student_Number?
if 'Student_Number' in cols:
    print("Has Student_Number directly")
else:
    print("No Student_Number - need to join via Family_Number + Child_Number")
    # Check students table
    cur.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Students' ORDER BY ORDINAL_POSITION")
    stu_cols = [r[0] for r in cur.fetchall()]
    print(f"Students columns: {stu_cols}")
    
    if 'Family_Number' in stu_cols:
        # Sample join
        cur.execute("""
            SELECT TOP 3
                s.Student_Number,
                fc.E_Child_Name,
                fc.A_Child_Name,
                fc.Gender,
                fc.Child_Birth_Date,
                fc.Nationality_Code_Primary
            FROM Students s
            JOIN Family_Children fc ON s.Family_Number = fc.Family_Number 
                AND s.Family_Sub = fc.Family_Sub
                AND s.Child_Number = fc.Child_Number
        """)
        print("\nJoined student + child sample:")
        for row in cur.fetchall():
            print(f"  SN={row[0]}, E_Name={row[1]}, A_Name={row[2]}, Gender={row[3]}, DOB={row[4]}, Nat={row[5]}")
        
        # Total matches
        cur.execute("""
            SELECT COUNT(DISTINCT s.Student_Number)
            FROM Students s
            JOIN Family_Children fc ON s.Family_Number = fc.Family_Number 
                AND s.Family_Sub = fc.Family_Sub
                AND s.Child_Number = fc.Child_Number
        """)
        print(f"\nTotal students with Family_Children match: {cur.fetchone()[0]}")

conn.close()

import pyodbc
conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=172.16.1.160\\SQL2016;"
    "DATABASE=SIS;"
    "UID=sis_reader;"
    "PWD=Sis@12345Reader;"
)
c = conn.cursor()

# Check vwStudentFullName columns
c.execute("""
    SELECT COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'vwStudentFullName'
    ORDER BY ORDINAL_POSITION
""")
print("=== vwStudentFullName columns ===")
for r in c.fetchall():
    print(f"  {r[0]} ({r[1]})")

# Sample rows
c.execute("SELECT TOP 5 * FROM vwStudentFullName")
cols = [d[0] for d in c.description]
print(f"\nColumns: {cols}")
for r in c.fetchall():
    print(f"  {dict(zip(cols, r))}")

# Also check Family_Children
c.execute("""
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Family_Children'
    ORDER BY ORDINAL_POSITION
""")
print("\n=== Family_Children columns ===")
for r in c.fetchall():
    print(f"  {r[0]}")

# Get grandfather via Family_Children + Family for a G12 student
c.execute("""
    SELECT TOP 5 fc.Student_Number, fc.Family_Number, fc.Child_Number,
           f.E_Grand_Father, f.E_Father_Name, f.E_Family_Name
    FROM Family_Children fc
    JOIN Family f ON fc.Family_Number = f.Family_Number
    WHERE f.E_Grand_Father IS NOT NULL AND f.E_Grand_Father != ''
""")
print("\n=== Family_Children + Family join ===")
for r in c.fetchall():
    print(f"  SN={r[0]} GrandF='{r[3]}' Father='{r[4]}' Family='{r[5]}'")

conn.close()

"""Check full name fields for Al Walid Saleh."""
import pyodbc

conn = pyodbc.connect(
    r"DRIVER={ODBC Driver 17 for SQL Server};"
    r"SERVER=localhost\SQLEXPRESS;"
    r"DATABASE=_bak_import_temp;"
    r"Trusted_Connection=yes;"
)
c = conn.cursor()

# Find grandfather column name
c.execute("""
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Family' AND COLUMN_NAME LIKE '%Grand%' OR COLUMN_NAME LIKE '%grand%'
    ORDER BY COLUMN_NAME
""")
print("Grand columns in Family:", [r[0] for r in c.fetchall()])

# Check vw_RegisteredStudents columns for name
c.execute("""
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'vw_RegisteredStudents' AND COLUMN_NAME LIKE '%Name%'
    ORDER BY COLUMN_NAME
""")
print("Name columns in vw_RegisteredStudents:", [r[0] for r in c.fetchall()])

# Check Family_Children name columns
c.execute("""
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Family_Children' AND COLUMN_NAME LIKE '%Name%'
    ORDER BY COLUMN_NAME
""")
print("Name columns in Family_Children:", [r[0] for r in c.fetchall()])

# Check Family name columns
c.execute("""
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Family' AND COLUMN_NAME LIKE '%Name%'
    ORDER BY COLUMN_NAME
""")
print("Name columns in Family:", [r[0] for r in c.fetchall()])

# Now query the actual data
c.execute("""
    SELECT 
        s.Student_Number,
        fc.E_Child_Name,
        f.E_Father_Name,
        f.E_Family_Name
    FROM Student s
    LEFT JOIN Family_Children fc ON s.Family_Number = fc.Family_Number AND s.Child_Number = fc.Child_Number
    LEFT JOIN Family f ON s.Family_Number = f.Family_Number
    WHERE fc.E_Child_Name LIKE '%Walid%' AND f.E_Family_Name LIKE '%Saleh%'
""")
for r in c.fetchall():
    print(f"\nStudent: {r[0]}")
    print(f"  E_Child_Name:  {r[1]}")
    print(f"  E_Father_Name: {r[2]}")
    print(f"  E_Family_Name: {r[3]}")
    print(f"  FULL NAME:     {r[1]} {r[2]} {r[3]}")

# Also check vw_RegisteredStudents
c.execute("""
    SELECT E_Child_Name, E_Father_Name, E_Family_Name
    FROM vw_RegisteredStudents
    WHERE E_Child_Name LIKE '%Walid%' AND E_Family_Name LIKE '%Saleh%'
""")
print("\nFrom vw_RegisteredStudents:")
for r in c.fetchall():
    print(f"  {r[0]} {r[1]} {r[2]}")

conn.close()

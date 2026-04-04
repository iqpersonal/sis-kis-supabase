"""Check full name fields for Al Walid Saleh."""
import pyodbc

conn = pyodbc.connect(
    r"DRIVER={ODBC Driver 17 for SQL Server};"
    r"SERVER=localhost\SQLEXPRESS;"
    r"DATABASE=_bak_import_temp;"
    r"Trusted_Connection=yes;"
)
c = conn.cursor()

# Check all name-related fields
c.execute("""
    SELECT 
        s.Student_Number,
        fc.E_Child_Name,
        fc.A_Child_Name,
        f.E_Father_Name,
        f.A_Father_Name,
        f.E_Family_Name,
        f.A_Family_Name,
        f.E_Grand_Father_Name,
        f.A_Grand_Father_Name
    FROM Student s
    LEFT JOIN Family_Children fc ON s.Family_Number = fc.Family_Number AND s.Child_Number = fc.Child_Number
    LEFT JOIN Family f ON s.Family_Number = f.Family_Number
    WHERE fc.E_Child_Name LIKE '%Walid%' AND f.E_Family_Name LIKE '%Saleh%'
""")
for r in c.fetchall():
    print(f"Student Number:     {r[0]}")
    print(f"E_Child_Name:       {r[1]}")
    print(f"A_Child_Name:       {r[2]}")
    print(f"E_Father_Name:      {r[3]}")
    print(f"A_Father_Name:      {r[4]}")
    print(f"E_Family_Name:      {r[5]}")
    print(f"A_Family_Name:      {r[6]}")
    print(f"E_Grand_Father_Name:{r[7]}")
    print(f"A_Grand_Father_Name:{r[8]}")
    full = f"{r[1]} {r[3]} {r[7]} {r[5]}".strip() if r[7] else f"{r[1]} {r[3]} {r[5]}".strip()
    print(f"FULL NAME:          {full}")
    print()

conn.close()

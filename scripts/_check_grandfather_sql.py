import pyodbc

conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=172.16.1.160\\SQL2016;"
    "DATABASE=SIS;"
    "UID=sis_reader;"
    "PWD=Sis@12345Reader;"
)
cursor = conn.cursor()

# Sample grandfather names from Family table
cursor.execute("""
    SELECT TOP 10 
        f.Family_Number, f.E_Grand_Father, f.A_Grand_Father, f.E_Father_Name, f.E_Family_Name
    FROM Family f
    WHERE f.E_Grand_Father IS NOT NULL AND f.E_Grand_Father != ''
""")
rows = cursor.fetchall()
print("=== Family table - grandfather samples ===")
for r in rows:
    print(f"  Family={r.Family_Number} GrandF='{r.E_Grand_Father}' Father='{r.E_Father_Name}' Family='{r.E_Family_Name}'")

# Check how Family links to Student/Child
cursor.execute("""
    SELECT TOP 5 
        c.Student_Number, c.E_Child_Name, c.Family_Number, c.Child_Number,
        f.E_Father_Name, f.E_Grand_Father, f.E_Family_Name
    FROM Child c
    JOIN Family f ON c.Family_Number = f.Family_Number
    WHERE f.E_Grand_Father IS NOT NULL AND f.E_Grand_Father != ''
""")
rows = cursor.fetchall()
print("\n=== Child + Family join - with grandfather ===")
for r in rows:
    full = f"{r.E_Child_Name} {r.E_Father_Name} {r.E_Grand_Father} {r.E_Family_Name}".strip()
    print(f"  SN={r.Student_Number} => '{full}'")
    print(f"    Child='{r.E_Child_Name}' Father='{r.E_Father_Name}' GrandF='{r.E_Grand_Father}' Family='{r.E_Family_Name}'")

# Count how many families have grandfather name
cursor.execute("SELECT COUNT(*) FROM Family WHERE E_Grand_Father IS NOT NULL AND E_Grand_Father != ''")
count = cursor.fetchone()[0]
cursor.execute("SELECT COUNT(*) FROM Family")
total = cursor.fetchone()[0]
print(f"\nFamilies with E_Grand_Father: {count}/{total}")

conn.close()

"""Check grandfather column and data."""
import pyodbc
conn = pyodbc.connect(
    r"DRIVER={ODBC Driver 17 for SQL Server};"
    r"SERVER=localhost\SQLEXPRESS;"
    r"DATABASE=_bak_import_temp;"
    r"Trusted_Connection=yes;"
)
c = conn.cursor()

# Get unique grand columns
c.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Family' AND COLUMN_NAME LIKE '%Grand%'")
cols = sorted(set(r[0] for r in c.fetchall()))
print("Grand columns:", cols)

# Coverage
c.execute("SELECT COUNT(*) FROM Family WHERE E_Grand_Father IS NOT NULL AND E_Grand_Father != ''")
print(f"Families with E_Grand_Father: {c.fetchone()[0]}")
c.execute("SELECT COUNT(*) FROM Family")
print(f"Total families: {c.fetchone()[0]}")

# Sample
c.execute("SELECT TOP 5 E_Grand_Father, A_Grand_Father FROM Family WHERE E_Grand_Father IS NOT NULL AND E_Grand_Father != ''")
for r in c.fetchall():
    print(f"  EN: {r[0]}  AR: {r[1]}")

# Al Walid Saleh
c.execute("""
    SELECT fc.E_Child_Name, f.E_Father_Name, f.E_Grand_Father, f.E_Family_Name
    FROM Family f
    JOIN Student s ON f.Family_Number = s.Family_Number
    JOIN Family_Children fc ON s.Family_Number = fc.Family_Number AND s.Child_Number = fc.Child_Number
    WHERE fc.E_Child_Name LIKE '%Walid%' AND f.E_Family_Name LIKE '%Saleh%'
""")
for r in c.fetchall():
    parts = [p for p in [r[0], r[1], r[2], r[3]] if p and str(p).strip()]
    print(f"Full name: {' '.join(str(p).strip() for p in parts)}")

conn.close()

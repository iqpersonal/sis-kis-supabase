"""Check tbOtherIds for student iqama numbers."""
import pyodbc

conn = pyodbc.connect(
    r"DRIVER={ODBC Driver 17 for SQL Server};"
    r"SERVER=localhost\SQLEXPRESS;"
    r"DATABASE=_bak_import_temp;"
    r"Trusted_Connection=yes;"
)
c = conn.cursor()

# Check the type codes
print("=== tblOtherId_Types ===")
c.execute("SELECT * FROM tblOtherId_Types")
for r in c.fetchall():
    print(f"  {[col[0] for col in c.description]}")
    print(f"  {list(r)}")
    break  # just print header once

c.execute("SELECT * FROM tblOtherId_Types")
cols = [col[0] for col in c.description]
for r in c.fetchall():
    row = dict(zip(cols, r))
    print(f"  Code={row}")

# Check tbOtherIds structure
print("\n=== tbOtherIds columns ===")
c.execute("""SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_NAME='tbOtherIds' ORDER BY ORDINAL_POSITION""")
for r in c.fetchall():
    print(f"  {r[0]}: {r[1]}")

# Count by type
print("\n=== tbOtherIds by type ===")
c.execute("SELECT OtherIdType, COUNT(*) as cnt FROM tbOtherIds GROUP BY OtherIdType")
for r in c.fetchall():
    print(f"  Type {r[0]}: {r[1]:,} records")

# Sample data
print("\n=== Sample tbOtherIds (first 10) ===")
c.execute("SELECT TOP 10 * FROM tbOtherIds")
cols = [col[0] for col in c.description]
print(f"  Columns: {cols}")
for r in c.fetchall():
    row = dict(zip(cols, r))
    # Only print non-null fields
    relevant = {k: v for k, v in row.items() if v is not None and str(v).strip()}
    print(f"  {relevant}")

# Check specifically for "Walid" student in tbOtherIds  
print("\n=== Looking for Al Walid Saleh (passport 1443141216) ===")
c.execute("""
    SELECT o.*, s.Student_Number, fc.E_Child_Name, f.E_Family_Name
    FROM tbOtherIds o
    JOIN Student s ON s.Student_Number = CAST(o.Student_Number AS NVARCHAR)
    LEFT JOIN Family_Children fc ON s.Family_Number = fc.Family_Number AND s.Child_Number = fc.Child_Number
    LEFT JOIN Family f ON s.Family_Number = f.Family_Number
    WHERE fc.E_Child_Name LIKE '%Walid%' OR f.E_Family_Name LIKE '%Saleh%'
""")
cols = [col[0] for col in c.description]
for r in c.fetchall():
    row = dict(zip(cols, r))
    relevant = {k: v for k, v in row.items() if v is not None and str(v).strip()}
    print(f"  {relevant}")

# Also check: how many students have FatherId in Family?
print("\n=== FatherId coverage ===")
c.execute("SELECT COUNT(*) FROM Family WHERE FatherId IS NOT NULL AND FatherId != ''")
print(f"  Families with FatherId: {c.fetchone()[0]}")
c.execute("SELECT COUNT(*) FROM Family")
print(f"  Total families: {c.fetchone()[0]}")

# Check vwStudentDetails ID_Number vs Family ID_Number
print("\n=== ID_Number sources ===")
c.execute("SELECT COUNT(*) FROM Family WHERE ID_Number IS NOT NULL AND ID_Number != ''")
print(f"  Family.ID_Number (non-empty): {c.fetchone()[0]}")
c.execute("SELECT COUNT(*) FROM vwStudentDetails WHERE ID_Number IS NOT NULL AND ID_Number != ''")
print(f"  vwStudentDetails.ID_Number (non-empty): {c.fetchone()[0]}")

conn.close()

import pyodbc

conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost\\SQLEXPRESS;"
    "DATABASE=_bak_import_temp;"
    "Trusted_Connection=yes"
)
cur = conn.cursor()

# Search for iqama/residence-related columns
cur.execute("""
    SELECT TABLE_NAME, COLUMN_NAME 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE COLUMN_NAME LIKE '%iqam%' 
       OR COLUMN_NAME LIKE '%resid%' 
       OR COLUMN_NAME LIKE '%civil%'
       OR COLUMN_NAME LIKE '%national_id%'
       OR COLUMN_NAME LIKE '%id_no%'
       OR COLUMN_NAME LIKE '%ID_Number%'
    ORDER BY TABLE_NAME, COLUMN_NAME
""")
print("=== Iqama / ID columns ===")
for r in cur.fetchall():
    print(f"  {r[0]}.{r[1]}")

# Also check what passport_id looks like for a sample student
cur.execute("""
    SELECT TOP 5 Child_Id, Passport_No, Civil_No
    FROM Family_Children
    WHERE Passport_No IS NOT NULL AND Passport_No != ''
""")
print("\n=== Sample passport/civil data ===")
for r in cur.fetchall():
    print(f"  Child_Id={r[0]}, Passport_No={r[1]}, Civil_No={r[2]}")

# Check all columns of Family_Children
cur.execute("""
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Family_Children'
    ORDER BY ORDINAL_POSITION
""")
print("\n=== All Family_Children columns ===")
for r in cur.fetchall():
    print(f"  {r[0]}")

conn.close()

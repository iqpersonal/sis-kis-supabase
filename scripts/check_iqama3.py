import pyodbc

conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost\\SQLEXPRESS;"
    "DATABASE=_bak_import_temp;"
    "Trusted_Connection=yes"
)
cur = conn.cursor()

# Check StudentDetails columns
cur.execute("""
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'StudentDetails'
    ORDER BY ORDINAL_POSITION
""")
print("=== StudentDetails columns ===")
for r in cur.fetchall():
    print(f"  {r[0]}")

# Check vwStudentDetails columns  
cur.execute("""
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'vwStudentDetails'
    ORDER BY ORDINAL_POSITION
""")
print("\n=== vwStudentDetails columns ===")
for r in cur.fetchall():
    print(f"  {r[0]}")

conn.close()

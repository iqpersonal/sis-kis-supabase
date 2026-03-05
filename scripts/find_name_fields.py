import pyodbc

conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=.\\SQLEXPRESS;"
    "DATABASE=_bak_import_temp;"
    "Trusted_Connection=yes"
)
cur = conn.cursor()

# Find tables with student name fields
cur.execute("""
    SELECT TABLE_NAME, COLUMN_NAME 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE COLUMN_NAME LIKE '%Student_Name%' OR COLUMN_NAME LIKE '%Child_Name%'
    ORDER BY TABLE_NAME
""")
print("Tables with name columns:")
for row in cur.fetchall():
    print(f"  {row[0]}.{row[1]}")

# Find tables with Gender, Birth_Date, Nationality
print("\nTables with Gender:")
cur.execute("SELECT DISTINCT TABLE_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME = 'Gender' AND TABLE_TYPE_HACK = 'x'")
# Try a different approach
cur.execute("""
    SELECT TABLE_NAME, COLUMN_NAME 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE COLUMN_NAME IN ('Gender', 'Child_Birth_Date', 'Birth_Date', 'Nationality_Code', 'Nationality_Code_Primary')
    AND TABLE_NAME NOT LIKE 'vw%'
    ORDER BY TABLE_NAME, COLUMN_NAME
""")
print("\nTables with Gender/BirthDate/Nationality (base tables only):")
for row in cur.fetchall():
    print(f"  {row[0]}.{row[1]}")

# Check the Family table structure
print("\n=== Family / Children tables ===")
for tbl_pattern in ['%Family%', '%Child%', '%Sponsor%']:
    cur.execute(f"SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '{tbl_pattern}' AND TABLE_TYPE = 'BASE TABLE'")
    tables = [r[0] for r in cur.fetchall()]
    if tables:
        print(f"\n{tbl_pattern} tables: {tables}")
        for t in tables[:3]:
            cur.execute(f"SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '{t}' ORDER BY ORDINAL_POSITION")
            cols = [r[0] for r in cur.fetchall()]
            print(f"  {t}: {cols}")

conn.close()

import pyodbc

conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost\\SQLEXPRESS;"
    "DATABASE=_bak_import_temp;"
    "Trusted_Connection=yes"
)
cur = conn.cursor()

# Check all columns of Family_Children
cur.execute("""
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Family_Children'
    ORDER BY ORDINAL_POSITION
""")
print("=== All Family_Children columns ===")
for r in cur.fetchall():
    print(f"  {r[0]}")

# Check StudentDetails for ID_Number and passport
cur.execute("""
    SELECT TOP 5 Child_Id, ID_Number, Passport_Number, Birth_Country
    FROM StudentDetails
    WHERE ID_Number IS NOT NULL AND ID_Number != ''
""")
print("\n=== Sample StudentDetails data ===")
for r in cur.fetchall():
    print(f"  Child={r[0]}, ID_Number={r[1]}, Passport={r[2]}, BirthCountry={r[3]}")

conn.close()

import pyodbc

SERVER = r"localhost\SQLEXPRESS"
DB = "_bak_import_temp"
conn = pyodbc.connect(
    f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={SERVER};DATABASE={DB};Trusted_Connection=yes",
    timeout=10,
)
cursor = conn.cursor()

# List all columns in Family table
cursor.execute("""
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Family'
    ORDER BY ORDINAL_POSITION
""")
print("=== All columns in Family table ===")
for row in cursor.fetchall():
    print(f"  {row.COLUMN_NAME:40s} {row.DATA_TYPE:15s} {row.CHARACTER_MAXIMUM_LENGTH}")

# Check phone-related columns specifically
cursor.execute("""
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Family'
      AND (COLUMN_NAME LIKE '%phone%' OR COLUMN_NAME LIKE '%mobile%' OR COLUMN_NAME LIKE '%tel%')
""")
print("\n=== Phone/Mobile/Tel columns ===")
for row in cursor.fetchall():
    print(f"  {row.COLUMN_NAME}")

# Check actual data for family 0021-3632
cursor.execute("""
    SELECT *
    FROM Family
    WHERE Family_Number = '0021-3632'
""")
cols = [col[0] for col in cursor.description]
row = cursor.fetchone()
if row:
    print(f"\n=== Family 0021-3632 data ===")
    for c, v in zip(cols, row):
        if v and str(v).strip():
            print(f"  {c:40s} = {v}")
        elif 'phone' in c.lower() or 'mobile' in c.lower():
            print(f"  {c:40s} = [{v}]  <-- EMPTY")
else:
    print("\nFamily 0021-3632 not found in SQL")

conn.close()

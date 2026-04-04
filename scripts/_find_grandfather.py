import pyodbc

conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=172.16.1.160\\SQL2016;"
    "DATABASE=SIS;"
    "UID=sis_reader;"
    "PWD=Sis@12345Reader;"
)
cursor = conn.cursor()

# Find all columns with 'grand' or 'grandfather' in the name
cursor.execute("""
    SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE COLUMN_NAME LIKE '%grand%' OR COLUMN_NAME LIKE '%Grand%'
    ORDER BY TABLE_NAME, COLUMN_NAME
""")
rows = cursor.fetchall()
print("=== Columns with 'grand' ===")
for r in rows:
    print(f"  {r.TABLE_NAME}.{r.COLUMN_NAME} ({r.DATA_TYPE})")

# Also check the Child table for all name-related columns
cursor.execute("""
    SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME IN ('Child', 'Children', 'Student', 'Students', 'Family')
      AND (COLUMN_NAME LIKE '%Name%' OR COLUMN_NAME LIKE '%name%' OR COLUMN_NAME LIKE '%full%')
    ORDER BY TABLE_NAME, COLUMN_NAME
""")
rows = cursor.fetchall()
print("\n=== Name columns in key tables ===")
for r in rows:
    print(f"  {r.TABLE_NAME}.{r.COLUMN_NAME} ({r.DATA_TYPE})")

conn.close()

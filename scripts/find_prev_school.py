import pyodbc

conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost\\SQLEXPRESS;"
    "DATABASE=_bak_import_temp;"
    "Trusted_Connection=yes;"
)
cursor = conn.cursor()

print("=" * 80)
print("QUERY 1: Columns containing previous/prev/transfer/former")
print("=" * 80)
cursor.execute("""
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE COLUMN_NAME LIKE '%previous%' OR COLUMN_NAME LIKE '%prev%' 
   OR COLUMN_NAME LIKE '%transfer%' OR COLUMN_NAME LIKE '%former%'
ORDER BY TABLE_NAME
""")
rows = cursor.fetchall()
for r in rows:
    print(f"  {r.TABLE_NAME}.{r.COLUMN_NAME} ({r.DATA_TYPE})")
if not rows:
    print("  (no results)")

print()
print("=" * 80)
print("QUERY 2: Tables related to Transfer/History/Previous/School")
print("=" * 80)
cursor.execute("""
SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_NAME LIKE '%Transfer%' OR TABLE_NAME LIKE '%History%' 
   OR TABLE_NAME LIKE '%Previous%' OR TABLE_NAME LIKE '%School%'
ORDER BY TABLE_NAME
""")
rows = cursor.fetchall()
for r in rows:
    print(f"  {r.TABLE_NAME}")
if not rows:
    print("  (no results)")

print()
print("=" * 80)
print("QUERY 3: Family_Children school-related columns")
print("=" * 80)
cursor.execute("""
SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'Family_Children' 
  AND (COLUMN_NAME LIKE '%school%' OR COLUMN_NAME LIKE '%prev%' OR COLUMN_NAME LIKE '%transfer%')
""")
rows = cursor.fetchall()
for r in rows:
    print(f"  {r.COLUMN_NAME} ({r.DATA_TYPE})")
if not rows:
    print("  (no results)")

print()
print("=" * 80)
print("QUERY 4: Student table school-related columns")
print("=" * 80)
cursor.execute("""
SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'Student' 
  AND (COLUMN_NAME LIKE '%school%' OR COLUMN_NAME LIKE '%prev%' OR COLUMN_NAME LIKE '%transfer%')
""")
rows = cursor.fetchall()
for r in rows:
    print(f"  {r.COLUMN_NAME} ({r.DATA_TYPE})")
if not rows:
    print("  (no results)")

print()
print("=" * 80)
print("QUERY 5: Registration table school-related columns")
print("=" * 80)
cursor.execute("""
SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'Registration' 
  AND (COLUMN_NAME LIKE '%school%' OR COLUMN_NAME LIKE '%prev%' OR COLUMN_NAME LIKE '%transfer%')
""")
rows = cursor.fetchall()
for r in rows:
    print(f"  {r.COLUMN_NAME} ({r.DATA_TYPE})")
if not rows:
    print("  (no results)")

print()
print("=" * 80)
print("QUERY 6: Family_Children row for Amina (0021-3183, Child 1)")
print("=" * 80)
cursor.execute("SELECT TOP 1 * FROM Family_Children WHERE Family_Number='0021-3183' AND Child_Number=1")
cols = [col[0] for col in cursor.description]
row = cursor.fetchone()
if row:
    for c, v in zip(cols, row):
        print(f"  {c}: {v}")
else:
    print("  (no results)")

print()
print("=" * 80)
print("QUERY 7: Student row for Amina (0021-318311)")
print("=" * 80)
cursor.execute("SELECT TOP 1 * FROM Student WHERE Student_Number='0021-318311'")
cols = [col[0] for col in cursor.description]
row = cursor.fetchone()
if row:
    for c, v in zip(cols, row):
        print(f"  {c}: {v}")
else:
    print("  (no results)")

print()
print("=" * 80)
print("QUERY 8: Tables with School in the name")
print("=" * 80)
cursor.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%School%'")
rows = cursor.fetchall()
for r in rows:
    print(f"  {r.TABLE_NAME}")
if not rows:
    print("  (no results)")

conn.close()
print()
print("Done.")

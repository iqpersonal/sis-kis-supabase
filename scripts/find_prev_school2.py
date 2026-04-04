import pyodbc

conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost\\SQLEXPRESS;"
    "DATABASE=_bak_import_temp;"
    "Trusted_Connection=yes;"
)
cursor = conn.cursor()

print("=" * 80)
print("Student_Previous_School - ALL COLUMNS")
print("=" * 80)
cursor.execute("""
SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'Student_Previous_School'
ORDER BY ORDINAL_POSITION
""")
for r in cursor.fetchall():
    print(f"  {r.COLUMN_NAME} ({r.DATA_TYPE}, max_len={r.CHARACTER_MAXIMUM_LENGTH})")

print()
print("=" * 80)
print("Student_Previous_School - Amina's data")
print("=" * 80)
cursor.execute("SELECT * FROM Student_Previous_School WHERE Student_Number='0021-318311'")
cols = [col[0] for col in cursor.description]
rows = cursor.fetchall()
if rows:
    for row in rows:
        for c, v in zip(cols, row):
            print(f"  {c}: {v}")
        print("  ---")
else:
    print("  (no results)")

print()
print("=" * 80)
print("vwStudentPreviousSchools - ALL COLUMNS")
print("=" * 80)
cursor.execute("""
SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'vwStudentPreviousSchools'
ORDER BY ORDINAL_POSITION
""")
for r in cursor.fetchall():
    print(f"  {r.COLUMN_NAME} ({r.DATA_TYPE}, max_len={r.CHARACTER_MAXIMUM_LENGTH})")

print()
print("=" * 80)
print("vwStudentPreviousSchools - Amina's data")
print("=" * 80)
cursor.execute("SELECT * FROM vwStudentPreviousSchools WHERE Student_Number='0021-318311'")
cols = [col[0] for col in cursor.description]
rows = cursor.fetchall()
if rows:
    for row in rows:
        for c, v in zip(cols, row):
            print(f"  {c}: {v}")
        print("  ---")
else:
    print("  (no results)")

print()
print("=" * 80)
print("Student_Previous_School - sample rows (TOP 5)")
print("=" * 80)
cursor.execute("SELECT TOP 5 * FROM Student_Previous_School")
cols = [col[0] for col in cursor.description]
rows = cursor.fetchall()
for row in rows:
    for c, v in zip(cols, row):
        print(f"  {c}: {v}")
    print("  ---")
if not rows:
    print("  (no results)")

print()
print("=" * 80)
print("Student_Previous_School - total row count")
print("=" * 80)
cursor.execute("SELECT COUNT(*) FROM Student_Previous_School")
print(f"  {cursor.fetchone()[0]} rows")

print()
print("=" * 80)
print("LocalSchools - ALL COLUMNS")
print("=" * 80)
cursor.execute("""
SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'LocalSchools'
ORDER BY ORDINAL_POSITION
""")
for r in cursor.fetchall():
    print(f"  {r.COLUMN_NAME} ({r.DATA_TYPE}, max_len={r.CHARACTER_MAXIMUM_LENGTH})")

print()
print("=" * 80)
print("ForeignSchools - ALL COLUMNS")
print("=" * 80)
cursor.execute("""
SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'ForeignSchools'
ORDER BY ORDINAL_POSITION
""")
for r in cursor.fetchall():
    print(f"  {r.COLUMN_NAME} ({r.DATA_TYPE}, max_len={r.CHARACTER_MAXIMUM_LENGTH})")

conn.close()
print()
print("Done.")

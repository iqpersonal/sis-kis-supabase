"""Quick check of Student_Invoice schema and doc sizes around failing area."""
import pyodbc

conn = pyodbc.connect(
    r"DRIVER={ODBC Driver 17 for SQL Server};"
    r"SERVER=localhost\SQLEXPRESS;"
    r"DATABASE=_bak_import_temp;"
    r"Trusted_Connection=yes"
)
cursor = conn.cursor()

# 1. Schema
print("=== Student_Invoice Schema ===")
cursor.execute("""
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Student_Invoice' 
    ORDER BY ORDINAL_POSITION
""")
for r in cursor.fetchall():
    print(f"  {r.COLUMN_NAME:40s} {r.DATA_TYPE:20s} {r.CHARACTER_MAXIMUM_LENGTH}")

# 2. Check max column sizes around the problem area (rows 4400-4600)
print("\n=== Max column sizes (rows 4400-4600) ===")
cursor.execute("""
    SELECT * FROM Student_Invoice 
    ORDER BY School_Code, Branch_Code, Academic_Year, Invoice_Sequence
    OFFSET 4400 ROWS FETCH NEXT 200 ROWS ONLY
""")
cols = [c[0] for c in cursor.description]
rows = cursor.fetchall()
for i, c in enumerate(cols):
    max_len = 0
    for r in rows:
        v = r[i]
        if v is not None:
            l = len(str(v))
            if l > max_len:
                max_len = l
    if max_len > 50:
        print(f"  {c}: max_str_len={max_len}")

# 3. Count: how many rows estimated per doc > threshold
print(f"\nTotal rows checked: {len(rows)}")
conn.close()

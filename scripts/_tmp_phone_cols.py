import pyodbc

conn = pyodbc.connect(
    'DRIVER={ODBC Driver 17 for SQL Server};'
    'SERVER=localhost\\SQLEXPRESS;'
    'DATABASE=_bak_import_temp;'
    'Trusted_Connection=yes'
)
cursor = conn.cursor()

# Search ALL tables for mobile columns
cursor.execute("""
    SELECT TABLE_NAME, COLUMN_NAME 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE COLUMN_NAME LIKE '%mobile%'
    ORDER BY TABLE_NAME, COLUMN_NAME
""")
print("=== 'Mobile' columns across ALL tables ===")
for r in cursor.fetchall():
    print(f"  {r[0]}.{r[1]}")

# Sponsor table phone columns
cursor.execute("""
    SELECT COLUMN_NAME 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME='Sponsor' 
      AND (COLUMN_NAME LIKE '%phone%' OR COLUMN_NAME LIKE '%mobile%' 
           OR COLUMN_NAME LIKE '%cell%' OR COLUMN_NAME LIKE '%tel%')
    ORDER BY COLUMN_NAME
""")
print("\n=== Phone/Mobile columns in Sponsor table ===")
sponsor_cols = [r[0] for r in cursor.fetchall()]
for c in sponsor_cols:
    cursor.execute(f"SELECT COUNT(*) FROM Sponsor WHERE [{c}] IS NOT NULL AND LTRIM(RTRIM(CAST([{c}] AS VARCHAR(100)))) != ''")
    count = cursor.fetchone()[0]
    cursor.execute(f"SELECT TOP 3 [{c}] FROM Sponsor WHERE [{c}] IS NOT NULL AND LTRIM(RTRIM(CAST([{c}] AS VARCHAR(100)))) != ''")
    samples = [str(r[0]).strip() for r in cursor.fetchall()]
    print(f"  {c}: {count} populated | Samples: {samples}")

# Student table phone columns
cursor.execute("""
    SELECT COLUMN_NAME 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME='Student' 
      AND (COLUMN_NAME LIKE '%phone%' OR COLUMN_NAME LIKE '%mobile%' 
           OR COLUMN_NAME LIKE '%cell%' OR COLUMN_NAME LIKE '%tel%')
    ORDER BY COLUMN_NAME
""")
print("\n=== Phone/Mobile columns in Student table ===")
for r in cursor.fetchall():
    print(f"  {r[0]}")

# Also search for Mobile1, Mobile2 specifically anywhere
cursor.execute("""
    SELECT TABLE_NAME, COLUMN_NAME 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE COLUMN_NAME IN ('Mobile1','Mobile2','Mobile_1','Mobile_2','Mob1','Mob2')
    ORDER BY TABLE_NAME, COLUMN_NAME
""")
print("\n=== Mobile1/Mobile2 specific search ===")
rows = cursor.fetchall()
if not rows:
    print("  NOT FOUND in any table")
else:
    for r in rows:
        print(f"  {r[0]}.{r[1]}")

# Family table - ALL phone columns with coverage
cursor.execute("""
    SELECT COLUMN_NAME 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME='Family' 
      AND (COLUMN_NAME LIKE '%phone%' OR COLUMN_NAME LIKE '%mobile%' 
           OR COLUMN_NAME LIKE '%cell%' OR COLUMN_NAME LIKE '%tel%')
    ORDER BY COLUMN_NAME
""")
print("\n=== Family table phone columns with coverage ===")
for r in cursor.fetchall():
    col = r[0]
    cursor.execute(f"SELECT COUNT(*) FROM Family WHERE [{col}] IS NOT NULL AND LTRIM(RTRIM([{col}])) != ''")
    count = cursor.fetchone()[0]
    print(f"  {col}: {count}/4435")

conn.close()

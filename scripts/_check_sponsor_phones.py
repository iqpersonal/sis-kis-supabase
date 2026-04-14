"""Check Sponsor table for phone data."""
import pyodbc

SERVER = r"localhost\SQLEXPRESS"
DB = "_bak_import_temp"
conn = pyodbc.connect(
    f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={SERVER};DATABASE={DB};Trusted_Connection=yes",
    timeout=10,
)
cur = conn.cursor()

# 1. Show all Sponsor columns
cur.execute("""
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Sponsor'
    ORDER BY ORDINAL_POSITION
""")
print("=== Sponsor table columns ===")
for r in cur.fetchall():
    print(f"  {r.COLUMN_NAME:40s} {r.DATA_TYPE:15s} {r.CHARACTER_MAXIMUM_LENGTH}")

# 2. Phone/mobile columns
cur.execute("""
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Sponsor'
      AND (COLUMN_NAME LIKE '%phone%' OR COLUMN_NAME LIKE '%mobile%' OR COLUMN_NAME LIKE '%tel%')
""")
print("\n=== Sponsor Phone/Mobile/Tel columns ===")
for r in cur.fetchall():
    print(f"  {r.COLUMN_NAME}")

# 3. Sample data for family 0021-3632
cur.execute("SELECT TOP 1 Student_Number FROM Student WHERE Family_Number = '0021-3632'")
sn_row = cur.fetchone()
if sn_row:
    sn = str(sn_row[0]).strip()
    print(f"\n=== Sponsor data for student {sn} (family 0021-3632) ===")
    cur.execute("SELECT * FROM Sponsor WHERE Student_Number = ? ORDER BY Academic_Year DESC", sn)
    cols = [c[0] for c in cur.description]
    for row in cur.fetchall():
        yr = row[cols.index("Academic_Year")]
        print(f"  --- Year: {yr} ---")
        for c, v in zip(cols, row):
            if c in ("DDS", "RowGUID", "DBGUID"):
                continue
            if v and str(v).strip():
                print(f"    {c:40s} = {v}")
            elif "phone" in c.lower() or "mobile" in c.lower():
                print(f"    {c:40s} = [{v}]  <-- EMPTY")

# 4. Dynamically count phone columns in Sponsor
cur.execute("""
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Sponsor'
      AND (COLUMN_NAME LIKE '%phone%' OR COLUMN_NAME LIKE '%mobile%' OR COLUMN_NAME LIKE '%tel%' OR COLUMN_NAME LIKE '%cell%')
""")
phone_cols_sponsor = [r.COLUMN_NAME for r in cur.fetchall()]
print(f"\n=== Sponsor phone coverage ===")
cur.execute("SELECT COUNT(*) FROM Sponsor")
total = cur.fetchone()[0]
print(f"  Total rows: {total}")
for col in phone_cols_sponsor:
    cur.execute(f"SELECT SUM(CASE WHEN [{col}] IS NOT NULL AND LTRIM(RTRIM([{col}])) != '' THEN 1 ELSE 0 END) FROM Sponsor")
    cnt = cur.fetchone()[0] or 0
    print(f"  Has {col}: {cnt}")

# 5. Also check Family_Children table for phone columns
cur.execute("""
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Family_Children'
      AND (COLUMN_NAME LIKE '%phone%' OR COLUMN_NAME LIKE '%mobile%' OR COLUMN_NAME LIKE '%tel%')
""")
print("\n=== Family_Children Phone/Mobile/Tel columns ===")
phone_cols = cur.fetchall()
for r in phone_cols:
    print(f"  {r.COLUMN_NAME}")
if not phone_cols:
    print("  (none)")

# 6. Check Family table phone coverage
cur.execute("""
    SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN Father_phone IS NOT NULL AND LTRIM(RTRIM(Father_phone)) != '' THEN 1 ELSE 0 END) as has_father_phone,
        SUM(CASE WHEN Mother_phone IS NOT NULL AND LTRIM(RTRIM(Mother_phone)) != '' THEN 1 ELSE 0 END) as has_mother_phone,
        SUM(CASE WHEN Family_Phone IS NOT NULL AND LTRIM(RTRIM(Family_Phone)) != '' THEN 1 ELSE 0 END) as has_family_phone,
        SUM(CASE WHEN Father_Work_Phone IS NOT NULL AND LTRIM(RTRIM(Father_Work_Phone)) != '' THEN 1 ELSE 0 END) as has_father_work_phone,
        SUM(CASE WHEN Mother_Work_Phone IS NOT NULL AND LTRIM(RTRIM(Mother_Work_Phone)) != '' THEN 1 ELSE 0 END) as has_mother_work_phone
    FROM Family
""")
row = cur.fetchone()
if row:
    print(f"\n=== Family table phone coverage ===")
    print(f"  Total families:       {row[0]}")
    print(f"  Has Father_phone:     {row[1]}")
    print(f"  Has Mother_phone:     {row[2]}")
    print(f"  Has Family_Phone:     {row[3]}")
    print(f"  Has Father_Work_Phone:{row[4]}")
    print(f"  Has Mother_Work_Phone:{row[5]}")

# 7. Show a few families that DO have phone data
cur.execute("""
    SELECT TOP 5 Family_Number, Father_phone, Mother_phone, Family_Phone
    FROM Family
    WHERE Father_phone IS NOT NULL AND LTRIM(RTRIM(Father_phone)) != ''
""")
rows = cur.fetchall()
if rows:
    print(f"\n=== Sample families WITH Father_phone ===")
    for r in rows:
        print(f"  {r.Family_Number}: father={r.Father_phone}, mother={r.Mother_phone}, family={r.Family_Phone}")
else:
    print("\n=== NO families have Father_phone data! ===")

# 8. Check Sponsor for the same - show a few with phone data
if phone_cols_sponsor:
    first_phone_col = phone_cols_sponsor[0]
    cur.execute(f"""
        SELECT TOP 5 Student_Number, Academic_Year, {', '.join(f'[{c}]' for c in phone_cols_sponsor)}
        FROM Sponsor
        WHERE [{first_phone_col}] IS NOT NULL AND LTRIM(RTRIM([{first_phone_col}])) != ''
        ORDER BY Academic_Year DESC
    """)
    rows = cur.fetchall()
    if rows:
        print(f"\n=== Sample Sponsors WITH {first_phone_col} ===")
        for row in rows:
            vals = {c: row[i+2] for i, c in enumerate(phone_cols_sponsor)}
            print(f"  Student {row[0]} (yr {row[1]}): {vals}")
    else:
        print(f"\n=== NO sponsors have {first_phone_col} data! ===")

conn.close()

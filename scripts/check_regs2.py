import pyodbc

conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=.\\SQLEXPRESS;"
    "DATABASE=_bak_import_temp;"
    "Trusted_Connection=yes"
)
cur = conn.cursor()

# Find academic years table
cur.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%cademic%' OR TABLE_NAME LIKE '%year%'")
print("Year-related tables:", [r[0] for r in cur.fetchall()])

# Check Registration table columns
cur.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Registration' ORDER BY ORDINAL_POSITION")
reg_cols = [r[0] for r in cur.fetchall()]
print("\nRegistration columns:", reg_cols)

# Check year column in Registration
year_cols = [c for c in reg_cols if 'year' in c.lower() or 'academic' in c.lower()]
print("Year columns:", year_cols)

# Get count directly using Academic_Year if it exists
if 'Academic_Year' in reg_cols:
    cur.execute("SELECT Academic_Year, COUNT(*) as total, COUNT(DISTINCT Student_Number) as unique_sn FROM Registration WHERE Academic_Year = '25-26' GROUP BY Academic_Year")
    row = cur.fetchone()
    if row:
        print(f"\nDirect: Academic_Year={row[0]}, total_regs={row[1]}, unique_students={row[2]}")
elif 'Year_ID' in reg_cols:
    # Find the Year_ID for 25-26
    cur.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%Year%' AND TABLE_TYPE = 'BASE TABLE'")
    year_tables = [r[0] for r in cur.fetchall()]
    print("\nYear base tables:", year_tables)
    
    for yt in year_tables:
        cur.execute(f"SELECT TOP 3 * FROM [{yt}]")
        cols = [d[0] for d in cur.description]
        print(f"\n{yt} columns: {cols}")
        for row in cur.fetchall():
            print(f"  {row}")

# Count total registrations by year
if 'Academic_Year' in reg_cols:
    cur.execute("""
        SELECT Academic_Year, COUNT(*) as cnt, COUNT(DISTINCT Student_Number) as unique_sn
        FROM Registration
        GROUP BY Academic_Year
        ORDER BY Academic_Year
    """)
    print("\nAll years in Registration:")
    for row in cur.fetchall():
        print(f"  {row[0]}: {row[1]} regs, {row[2]} unique students")
elif 'Year_ID' in reg_cols:
    cur.execute("""
        SELECT Year_ID, COUNT(*) as cnt, COUNT(DISTINCT Student_Number) as unique_sn
        FROM Registration
        GROUP BY Year_ID
        ORDER BY Year_ID
    """)
    print("\nAll Year_IDs in Registration:")
    for row in cur.fetchall():
        print(f"  Year_ID={row[0]}: {row[1]} regs, {row[2]} unique students")

# Check status columns
status_cols = [c for c in reg_cols if 'status' in c.lower()]
print(f"\nStatus columns: {status_cols}")
if status_cols:
    sc = status_cols[0]
    if 'Academic_Year' in reg_cols:
        cur.execute(f"SELECT [{sc}], COUNT(*) FROM Registration WHERE Academic_Year = '25-26' GROUP BY [{sc}] ORDER BY COUNT(*) DESC")
    elif 'Year_ID' in reg_cols:
        cur.execute(f"SELECT [{sc}], COUNT(*) FROM Registration GROUP BY [{sc}] ORDER BY COUNT(*) DESC")
    print(f"{sc} distribution:")
    for row in cur.fetchall():
        print(f"  {row[0]}: {row[1]}")

conn.close()

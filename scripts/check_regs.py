import pyodbc

conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=.\\SQLEXPRESS;"
    "DATABASE=_bak_import_temp;"
    "Trusted_Connection=yes"
)
cur = conn.cursor()

# Find registration table name
cur.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%regist%'")
tables = [r[0] for r in cur.fetchall()]
print("Registration tables:", tables)

if tables:
    tbl = tables[0]
    # Get columns
    cur.execute(f"SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '{tbl}' ORDER BY ORDINAL_POSITION")
    cols = [r[0] for r in cur.fetchall()]
    print(f"\nColumns in {tbl}:", cols)

    # Count for year 25-26
    cur.execute(f"""
        SELECT ay.Academic_Year,
               COUNT(*) as total_regs,
               COUNT(DISTINCT r.Student_Number) as unique_students
        FROM [{tbl}] r
        JOIN academic_years ay ON r.Year_ID = ay.Year_ID
        WHERE ay.Academic_Year = '25-26'
        GROUP BY ay.Academic_Year
    """)
    row = cur.fetchone()
    if row:
        print(f"\nSQL: Academic_Year={row[0]}, total_regs={row[1]}, unique_students={row[2]}")

    # Check if there's a Status column
    if "Status" in cols or "Reg_Status" in cols:
        status_col = "Status" if "Status" in cols else "Reg_Status"
        cur.execute(f"""
            SELECT r.[{status_col}], COUNT(*) as cnt
            FROM [{tbl}] r
            JOIN academic_years ay ON r.Year_ID = ay.Year_ID
            WHERE ay.Academic_Year = '25-26'
            GROUP BY r.[{status_col}]
            ORDER BY cnt DESC
        """)
        print(f"\n{status_col} distribution for 25-26:")
        for row in cur.fetchall():
            print(f"  {status_col}={row[0]}: {row[1]}")

conn.close()

"""Check Academic_Year columns and distinct values for the 4 failed tables."""
import pyodbc

SERVER = r"localhost\SQLEXPRESS"
DB = "_bak_import_temp"

conn = pyodbc.connect(
    f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={SERVER};"
    f"DATABASE={DB};Trusted_Connection=yes",
    autocommit=True,
)
cursor = conn.cursor()

tables = ["Student_Invoice", "tbDBLog", "Grades", "tbl_Quiz_Grades"]

for t in tables:
    # Check if Academic_Year column exists
    cursor.execute(f"""
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = ? AND COLUMN_NAME LIKE '%year%'
        ORDER BY COLUMN_NAME
    """, (t,))
    year_cols = [r.COLUMN_NAME for r in cursor.fetchall()]
    
    # Also get total row count
    cursor.execute(f"SELECT COUNT(*) FROM [{t}]")
    total = cursor.fetchone()[0]
    
    print(f"\n=== {t} ({total:,} rows) ===")
    print(f"  Year-like columns: {year_cols}")
    
    for col in year_cols:
        cursor.execute(f"SELECT DISTINCT [{col}] FROM [{t}] ORDER BY [{col}]")
        vals = [str(r[0]) for r in cursor.fetchall()]
        
        # Get count per year
        cursor.execute(f"SELECT [{col}], COUNT(*) as cnt FROM [{t}] GROUP BY [{col}] ORDER BY [{col}]")
        rows = cursor.fetchall()
        print(f"  {col} breakdown:")
        for r in rows:
            print(f"    {r[0]}: {r[1]:,} rows")

conn.close()

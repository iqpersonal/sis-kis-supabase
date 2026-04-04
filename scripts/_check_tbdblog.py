"""Inspect tbDBLog table structure and sample data."""
import pyodbc

SERVER = r"localhost\SQLEXPRESS"
DB = "_bak_import_temp"

conn = pyodbc.connect(
    f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={SERVER};"
    f"DATABASE={DB};Trusted_Connection=yes",
    autocommit=True,
)
cursor = conn.cursor()

# Column info
cursor.execute("""
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'tbDBLog'
    ORDER BY ORDINAL_POSITION
""")
print("=== tbDBLog Columns ===")
for r in cursor.fetchall():
    print(f"  {r.COLUMN_NAME:30s}  {r.DATA_TYPE:15s}  max_len={r.CHARACTER_MAXIMUM_LENGTH}")

# Sample rows
cursor.execute("SELECT TOP 5 * FROM [tbDBLog]")
cols = [c[0] for c in cursor.description]
print(f"\n=== Sample rows (cols: {cols}) ===")
for row in cursor.fetchall():
    for i, col in enumerate(cols):
        print(f"  {col}: {row[i]}")
    print("  ---")

# Row count
cursor.execute("SELECT COUNT(*) FROM [tbDBLog]")
print(f"\nTotal rows: {cursor.fetchone()[0]:,}")

conn.close()

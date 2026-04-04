"""Quick script to dump Employee table schema from SQL Server."""
import pyodbc

drivers = [d for d in pyodbc.drivers() if "SQL Server" in d]
driver = drivers[0]
conn = pyodbc.connect(
    f"DRIVER={{{driver}}};SERVER=localhost\\SQLEXPRESS;"
    f"DATABASE=_bak_import_temp;Trusted_Connection=yes;",
    autocommit=True,
)
cursor = conn.cursor()

# Get Employee table columns
cursor.execute(
    "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE "
    "FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Employee' "
    "ORDER BY ORDINAL_POSITION"
)
print("Employee Table Columns:")
print(f"{'Column':<35} {'Type':<20} {'MaxLen':<10} {'Nullable'}")
print("-" * 80)
for r in cursor.fetchall():
    print(f"{r[0]:<35} {r[1]:<20} {str(r[2] or ''):<10} {r[3]}")

# Sample data
print("\n\nSample Employee Data (first 3 rows):")
cursor.execute("SELECT TOP 3 * FROM [dbo].[Employee]")
cols = [col[0] for col in cursor.description]
for row in cursor.fetchall():
    print("\n---")
    for c, v in zip(cols, row):
        print(f"  {c}: {repr(v)[:100]}")

# Count
cursor.execute("SELECT COUNT(*) FROM [dbo].[Employee]")
print(f"\nTotal Employee rows: {cursor.fetchone()[0]}")

conn.close()

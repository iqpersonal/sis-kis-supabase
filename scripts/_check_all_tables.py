"""List all SQL tables and find employee-related columns."""
import pyodbc

drivers = [d for d in pyodbc.drivers() if "SQL Server" in d]
conn = pyodbc.connect(
    f"DRIVER={{{drivers[0]}}};SERVER=localhost\\SQLEXPRESS;"
    f"DATABASE=_bak_import_temp;Trusted_Connection=yes;",
    autocommit=True,
)
cursor = conn.cursor()

# List all tables
cursor.execute(
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES "
    "WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME"
)
tables = [r[0] for r in cursor.fetchall()]
print("All tables:")
for t in tables:
    cursor.execute(f"SELECT COUNT(*) FROM [{t}]")
    cnt = cursor.fetchone()[0]
    print(f"  {t}: {cnt} rows")

# Find any columns with Employee in them
print("\n\nColumns referencing 'Employee':")
cursor.execute(
    "SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS "
    "WHERE COLUMN_NAME LIKE '%Employee%' OR COLUMN_NAME LIKE '%Emp_%' "
    "ORDER BY TABLE_NAME, COLUMN_NAME"
)
for r in cursor.fetchall():
    print(f"  {r[0]}.{r[1]}")

# Check Section table for teacher/employee references
print("\n\nSection table columns:")
cursor.execute(
    "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS "
    "WHERE TABLE_NAME = 'Section' ORDER BY ORDINAL_POSITION"
)
for r in cursor.fetchall():
    print(f"  {r[0]}: {r[1]}")

conn.close()

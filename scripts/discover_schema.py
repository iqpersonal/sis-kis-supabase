"""Discover all tables, views, and their columns in the SQL database."""
import pyodbc

conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost\\SQLEXPRESS;"
    "DATABASE=_bak_import_temp;"
    "Trusted_Connection=yes;"
)
cursor = conn.cursor()

# Get all tables and views
cursor.execute("""
    SELECT TABLE_NAME, TABLE_TYPE
    FROM INFORMATION_SCHEMA.TABLES
    ORDER BY TABLE_TYPE, TABLE_NAME
""")
results = cursor.fetchall()

tables = [r.TABLE_NAME for r in results if r.TABLE_TYPE == 'BASE TABLE']
views = [r.TABLE_NAME for r in results if r.TABLE_TYPE == 'VIEW']

print(f"=== TABLES ({len(tables)}) ===")
for t in tables:
    print(f"  {t}")

print(f"\n=== VIEWS ({len(views)}) ===")
for v in views:
    print(f"  {v}")

# Get columns for important tables
important = [
    "Student", "Family", "Family_Children", "Registration", "Grades",
    "Subject", "Class", "Section", "Class_Subjects", "Nationality",
    "Student_Charges", "Charge_Type",
]
# Also add all views
important += views

print("\n\n=== COLUMN DETAILS ===")
for tbl in important:
    cursor.execute(f"""
        SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = '{tbl}'
        ORDER BY ORDINAL_POSITION
    """)
    cols = cursor.fetchall()
    if cols:
        print(f"\n--- {tbl} ({len(cols)} columns) ---")
        for c in cols:
            length = f"({c.CHARACTER_MAXIMUM_LENGTH})" if c.CHARACTER_MAXIMUM_LENGTH else ""
            nullable = " NULL" if c.IS_NULLABLE == "YES" else ""
            print(f"  {c.COLUMN_NAME}: {c.DATA_TYPE}{length}{nullable}")

# Count rows in key tables
print("\n\n=== ROW COUNTS ===")
for tbl in tables + views:
    try:
        cursor.execute(f"SELECT COUNT(*) FROM [{tbl}]")
        count = cursor.fetchone()[0]
        print(f"  {tbl}: {count:,}")
    except Exception as e:
        print(f"  {tbl}: ERROR - {e}")

conn.close()

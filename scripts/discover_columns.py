"""
Discover all columns in key tables used by the parent portal pipeline.
Used to design the full-extraction approach.
"""
import pyodbc

conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost\\SQLEXPRESS;"
    "DATABASE=_bak_import_temp;"
    "Trusted_Connection=yes;"
)
cursor = conn.cursor()

# Tables we want EVERY column from
tables = [
    "Student",
    "Family",
    "Family_Children",
    "Registration",
    "Nationality",
    "Class",
    "Section",
    "Subject",
    "Class_Subjects",
    "Charge_Type",
    "Student_Previous_School",
]

# Views
views = [
    "vwStudentDetails",
    "vwStudentPreviousSchools",
    "StudentDetails",
    "FamilyStudents",
]

print("=" * 70)
print("COLUMN INVENTORY FOR FULL-EXTRACTION PIPELINE")
print("=" * 70)

for tbl in tables + views:
    cursor.execute(f"""
        SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = '{tbl}'
        ORDER BY ORDINAL_POSITION
    """)
    cols = cursor.fetchall()
    if not cols:
        print(f"\n[{tbl}] — NOT FOUND")
        continue

    cursor.execute(f"SELECT COUNT(*) FROM [{tbl}]")
    count = cursor.fetchone()[0]

    print(f"\n[{tbl}] ({count:,} rows, {len(cols)} cols)")
    for c in cols:
        length = f"({c.CHARACTER_MAXIMUM_LENGTH})" if c.CHARACTER_MAXIMUM_LENGTH else ""
        print(f"  {c.COLUMN_NAME}: {c.DATA_TYPE}{length}")

# Show sample Student row to understand the Password field and others
print("\n\n" + "=" * 70)
print("SAMPLE STUDENT ROW (first 5 with Password)")
print("=" * 70)
cursor.execute("SELECT TOP 5 * FROM Student WHERE Password IS NOT NULL AND Password != ''")
cols = [c[0] for c in cursor.description]
for row in cursor.fetchall():
    print("\n---")
    for i, col in enumerate(cols):
        val = row[i]
        if val is not None and str(val).strip():
            print(f"  {col}: {val}")

# Show sample vwStudentDetails
print("\n\n" + "=" * 70)
print("SAMPLE vwStudentDetails (first 3 with ID_Number)")
print("=" * 70)
cursor.execute("SELECT TOP 3 * FROM vwStudentDetails WHERE ID_Number IS NOT NULL AND ID_Number != ''")
cols = [c[0] for c in cursor.description]
for row in cursor.fetchall():
    print("\n---")
    for i, col in enumerate(cols):
        val = row[i]
        if val is not None and str(val).strip():
            print(f"  {col}: {val}")

conn.close()

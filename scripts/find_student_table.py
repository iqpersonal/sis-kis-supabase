import pyodbc
conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=.\\SQLEXPRESS;"
    "DATABASE=_bak_import_temp;"
    "Trusted_Connection=yes"
)
cur = conn.cursor()

# Find student-related base tables
cur.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE 'Student%' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME")
print("Student base tables:")
for r in cur.fetchall():
    print(f"  {r[0]}")

# The "students" Firestore collection came from some upload. Let me check the Student table
cur.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Student' AND TABLE_TYPE='BASE TABLE'")
st = cur.fetchall()
print(f"\nStudent table exists: {len(st) > 0}")

# Check what has Family_Number + Student_Number
cur.execute("""
    SELECT TABLE_NAME 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE COLUMN_NAME = 'Student_Number' AND TABLE_NAME IN (
        SELECT TABLE_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME = 'Family_Number'
    )
    AND TABLE_NAME IN (
        SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'
    )
""")
print("\nBase tables with both Student_Number AND Family_Number:")
for r in cur.fetchall():
    print(f"  {r[0]}")

conn.close()

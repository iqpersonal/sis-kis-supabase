import pyodbc

conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost\\SQLEXPRESS;"
    "DATABASE=_bak_import_temp;"
    "Trusted_Connection=yes"
)
cur = conn.cursor()

# Check vwStudentDetails with ID_Number
cur.execute("""
    SELECT TOP 10 Student_Number, Family_Number, Child_Number, ID_Number, Enrollment_Date
    FROM vwStudentDetails
    WHERE ID_Number IS NOT NULL AND ID_Number != ''
""")
print("=== vwStudentDetails with ID_Number ===")
for r in cur.fetchall():
    print(f"  Student={r[0]}, Fam={r[1]}, Child={r[2]}, ID={r[3]}, Enroll={r[4]}")

# Count
cur.execute("""
    SELECT COUNT(*) FROM vwStudentDetails 
    WHERE ID_Number IS NOT NULL AND ID_Number != ''
""")
total = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM vwStudentDetails")
all_count = cur.fetchone()[0]
print(f"\n{total}/{all_count} have ID_Number in vwStudentDetails")

conn.close()

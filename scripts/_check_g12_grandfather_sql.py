import pyodbc

conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=172.16.1.160\\SQL2016;"
    "DATABASE=SIS;"
    "UID=sis_reader;"
    "PWD=Sis@12345Reader;"
)
c = conn.cursor()

# Check G12 students (class codes starting with 21) for 25-26 year
# and see which ones have grandfather names
c.execute("""
    SELECT 
        r.Student_Number,
        fn.E_Child_Name,
        fn.E_Father_Name,
        f.E_Grand_Father,
        fn.E_Family_Name,
        fn.E_FullName
    FROM Registration r
    JOIN vwStudentFullName fn ON r.Student_Number = fn.Student_Number
    JOIN Family f ON fn.Family_Number = f.Family_Number
    WHERE r.Academic_Year = '25-26'
      AND r.Class_Code LIKE '21%'
      AND r.Termination_Date IS NULL
    ORDER BY fn.E_FullName
""")

total = 0
with_gf = 0
without_gf = 0
print("=== G12 Students - Grandfather Check ===")
for row in c.fetchall():
    total += 1
    gf = (row.E_Grand_Father or '').strip()
    if gf:
        with_gf += 1
        parts = [p for p in [row.E_Child_Name, row.E_Father_Name, gf, row.E_Family_Name] if p and p.strip()]
        full4 = ' '.join(p.strip() for p in parts)
        print(f"  [GF] {row.Student_Number}: '{full4}' (was: '{row.E_FullName}')")
    else:
        without_gf += 1

print(f"\nTotal G12: {total}")
print(f"With grandfather: {with_gf}")
print(f"Without grandfather: {without_gf}")

conn.close()

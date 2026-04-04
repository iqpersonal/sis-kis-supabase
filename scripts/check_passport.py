import pyodbc

conn = pyodbc.connect(
    r"DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\SQLEXPRESS;DATABASE=_bak_import_temp;Trusted_Connection=yes"
)
cursor = conn.cursor()

# Check Child_id and Password for Hamada family
cursor.execute("""
    SELECT fc.Family_Number, fc.Child_Number, fc.E_Child_Name, fc.Child_id, 
           s.Password, s.Student_Number
    FROM Family_Children fc
    LEFT JOIN Student s 
        ON fc.Family_Number = s.Family_Number 
       AND fc.Family_Sub = s.Family_Sub 
       AND fc.Child_Number = s.Child_Number
    WHERE fc.Family_Number LIKE '%1448%'
""")
for r in cursor.fetchall():
    print(f"Family={r[0]} Child={r[1]} Name={r[2]} Child_id={repr(r[3])} Password={repr(r[4])} StudentNum={r[5]}")

# Also check how many have non-empty Child_id vs Password
cursor.execute("""
    SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN Child_id IS NOT NULL AND Child_id != '' THEN 1 ELSE 0 END) AS has_child_id,
        SUM(CASE WHEN s.Password IS NOT NULL AND s.Password != '' THEN 1 ELSE 0 END) AS has_password
    FROM Family_Children fc
    LEFT JOIN Student s 
        ON fc.Family_Number = s.Family_Number 
       AND fc.Family_Sub = s.Family_Sub 
       AND fc.Child_Number = s.Child_Number
""")
r = cursor.fetchone()
print(f"\nTotal: {r[0]}, Has Child_id: {r[1]}, Has Password: {r[2]}")

# Check vwStudentDetails for ID_Number (iqama)
cursor.execute("""
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN ID_Number IS NOT NULL AND ID_Number != '' THEN 1 ELSE 0 END) AS has_id
    FROM vwStudentDetails
""")
r = cursor.fetchone()
print(f"vwStudentDetails: Total={r[0]}, Has ID_Number(iqama)={r[1]}")

conn.close()

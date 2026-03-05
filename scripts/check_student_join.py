import pyodbc
conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=.\\SQLEXPRESS;"
    "DATABASE=_bak_import_temp;"
    "Trusted_Connection=yes"
)
cur = conn.cursor()

# Student table columns  
cur.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Student' ORDER BY ORDINAL_POSITION")
cols = [r[0] for r in cur.fetchall()]
print("Student columns:", cols)

# Join Student + Family_Children to get full student info
cur.execute("""
    SELECT TOP 5
        s.Student_Number,
        s.Family_Number,
        s.Family_Sub,
        s.Child_Number,
        fc.E_Child_Name,
        fc.A_Child_Name,
        fc.Gender,
        fc.Child_Birth_Date,
        fc.Nationality_Code_Primary
    FROM Student s
    JOIN Family_Children fc 
        ON s.Family_Number = fc.Family_Number 
        AND s.Family_Sub = fc.Family_Sub
        AND s.Child_Number = fc.Child_Number
""")
print("\nJoined sample:")
for row in cur.fetchall():
    print(f"  SN={row[0]}, Family={row[1]}, Sub={row[2]}, Child#={row[3]}")
    print(f"    E_Name={row[4]}, A_Name={row[5]}, Gender={row[6]}, DOB={row[7]}, Nat={row[8]}")

# Total match count
cur.execute("""
    SELECT COUNT(*)
    FROM Student s
    JOIN Family_Children fc 
        ON s.Family_Number = fc.Family_Number 
        AND s.Family_Sub = fc.Family_Sub
        AND s.Child_Number = fc.Child_Number
""")
print(f"\nTotal Student+FamilyChildren matched: {cur.fetchone()[0]}")

# Total students
cur.execute("SELECT COUNT(*) FROM Student")
print(f"Total Student rows: {cur.fetchone()[0]}")

conn.close()

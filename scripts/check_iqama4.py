import pyodbc

conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost\\SQLEXPRESS;"
    "DATABASE=_bak_import_temp;"
    "Trusted_Connection=yes"
)
cur = conn.cursor()

# Sample ID_Number from StudentDetails for Amina Daoud
cur.execute("""
    SELECT TOP 10 sd.Family_Number, sd.Child_Number, sd.ID_Number,
           fc.E_Child_Name, fc.Child_id
    FROM StudentDetails sd
    JOIN Family_Children fc ON sd.Family_Number = fc.Family_Number 
         AND sd.Child_Number = fc.Child_Number
    WHERE sd.ID_Number IS NOT NULL AND sd.ID_Number != ''
""")
print("=== Sample StudentDetails with ID_Number ===")
for r in cur.fetchall():
    print(f"  Fam={r[0]}, Child={r[1]}, ID_Number(iqama)={r[2]}, Name={r[3]}, Child_id(passport?)={r[4]}")

# Check how many have ID_Number
cur.execute("SELECT COUNT(*) FROM StudentDetails WHERE ID_Number IS NOT NULL AND ID_Number != ''")
total = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM StudentDetails")
all_count = cur.fetchone()[0]
print(f"\n{total}/{all_count} students have ID_Number (iqama)")

# Check Amina
cur.execute("""
    SELECT sd.Family_Number, sd.Child_Number, sd.ID_Number, fc.E_Child_Name, fc.Child_id
    FROM StudentDetails sd
    JOIN Family_Children fc ON sd.Family_Number = fc.Family_Number 
         AND sd.Child_Number = fc.Child_Number
    WHERE fc.E_Child_Name LIKE '%Amina%'
""")
print("\n=== Amina records ===")
for r in cur.fetchall():
    print(f"  Fam={r[0]}, Child={r[1]}, ID_Number={r[2]}, Name={r[3]}, Child_id={r[4]}")

conn.close()

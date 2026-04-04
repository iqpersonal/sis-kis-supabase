import pyodbc

conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost\\SQLEXPRESS;"
    "DATABASE=_bak_import_temp;"
    "Trusted_Connection=yes"
)
cur = conn.cursor()

# Test the fixed join
cur.execute("""
    SELECT TOP 20 fc.Family_Number, fc.Child_Number,
           fc.E_Child_Name, fc.Child_id,
           sd.ID_Number
    FROM Family_Children fc
    LEFT JOIN Family f ON fc.Family_Number = f.Family_Number
    LEFT JOIN StudentDetails sd ON fc.Family_Number = sd.Family_Number
         AND fc.Family_Sub = sd.Family_Sub
         AND fc.Child_Number = sd.Child_Number
    WHERE sd.ID_Number IS NOT NULL AND sd.ID_Number != ''
""")
print("=== Students with ID_Number (iqama) ===")
for r in cur.fetchall():
    print(f"  Fam={r[0]}, Child={r[1]}, Name={r[2]}, Child_id={r[3]}, ID_Number={r[4]}")

# Count
cur.execute("""
    SELECT COUNT(*) FROM Family_Children fc
    LEFT JOIN StudentDetails sd ON fc.Family_Number = sd.Family_Number
         AND fc.Family_Sub = sd.Family_Sub
         AND fc.Child_Number = sd.Child_Number
    WHERE sd.ID_Number IS NOT NULL AND sd.ID_Number != ''
""")
total = cur.fetchone()[0]
print(f"\n{total} students have iqama (ID_Number) via this join")

conn.close()

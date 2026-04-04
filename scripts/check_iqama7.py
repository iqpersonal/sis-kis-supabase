import pyodbc

conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=localhost\\SQLEXPRESS;"
    "DATABASE=_bak_import_temp;"
    "Trusted_Connection=yes"
)
cur = conn.cursor()

# Check StudentDetails data directly
cur.execute("""
    SELECT TOP 10 Family_Number, Family_Sub, Child_Number, ID_Number
    FROM StudentDetails
    WHERE ID_Number IS NOT NULL AND ID_Number != ''
""")
print("=== StudentDetails with ID_Number ===")
for r in cur.fetchall():
    print(f"  Fam={r[0]}, Sub={r[1]}, Child={r[2]}, ID={r[3]}")

# Check matching in Family_Children
cur.execute("""
    SELECT TOP 5 sd.Family_Number, sd.Family_Sub, sd.Child_Number, sd.ID_Number,
        fc.Family_Number as fc_fam, fc.Family_Sub as fc_sub, fc.Child_Number as fc_child
    FROM StudentDetails sd
    LEFT JOIN Family_Children fc ON sd.Family_Number = fc.Family_Number
         AND sd.Family_Sub = fc.Family_Sub
         AND sd.Child_Number = fc.Child_Number
    WHERE sd.ID_Number IS NOT NULL AND sd.ID_Number != ''
""")
print("\n=== StudentDetails joined to Family_Children ===")
for r in cur.fetchall():
    print(f"  SD: Fam={r[0]}, Sub={r[1]}, Child={r[2]}, ID={r[3]} | FC: Fam={r[4]}, Sub={r[5]}, Child={r[6]}")

# Check sample values from StudentDetails 
cur.execute("SELECT TOP 3 Family_Number, Family_Sub, Child_Number FROM StudentDetails")
print("\n=== Sample StudentDetails keys ===")
for r in cur.fetchall():
    print(f"  Fam={r[0]}, Sub={r[1]}, Child={r[2]}")

# Check matching in Family_Children WITHOUT Family_Sub
cur.execute("SELECT TOP 3 Family_Number, Family_Sub, Child_Number FROM Family_Children")
print("\n=== Sample Family_Children keys ===")
for r in cur.fetchall():
    print(f"  Fam={r[0]}, Sub={r[1]}, Child={r[2]}")

conn.close()

import pyodbc

conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=.\\SQLEXPRESS;"
    "DATABASE=_bak_import_temp;"
    "Trusted_Connection=yes"
)
cur = conn.cursor()

# Check InActive, Termination_Date, Final_Result, Registration_Type_Code distributions
print("=== InActive distribution for 25-26 ===")
cur.execute("SELECT InActive, COUNT(*) FROM Registration WHERE Academic_Year = '25-26' GROUP BY InActive ORDER BY InActive")
for row in cur.fetchall():
    print(f"  InActive={row[0]}: {row[1]}")

print("\n=== Termination_Date for 25-26 ===")
cur.execute("SELECT CASE WHEN Termination_Date IS NULL THEN 'NULL' ELSE 'HAS_DATE' END as td, COUNT(*) FROM Registration WHERE Academic_Year = '25-26' GROUP BY CASE WHEN Termination_Date IS NULL THEN 'NULL' ELSE 'HAS_DATE' END")
for row in cur.fetchall():
    print(f"  {row[0]}: {row[1]}")

print("\n=== Termination_Reason_Code for 25-26 ===")
cur.execute("SELECT Termination_Reason_Code, COUNT(*) FROM Registration WHERE Academic_Year = '25-26' GROUP BY Termination_Reason_Code ORDER BY COUNT(*) DESC")
for row in cur.fetchall():
    print(f"  Reason={row[0]}: {row[1]}")

print("\n=== Registration_Type_Code for 25-26 ===")
cur.execute("SELECT Registration_Type_Code, COUNT(*) FROM Registration WHERE Academic_Year = '25-26' GROUP BY Registration_Type_Code ORDER BY COUNT(*) DESC")
for row in cur.fetchall():
    print(f"  Type={row[0]}: {row[1]}")

print("\n=== Final_Result for 25-26 ===")
cur.execute("SELECT Final_Result, COUNT(*) FROM Registration WHERE Academic_Year = '25-26' GROUP BY Final_Result ORDER BY COUNT(*) DESC")
for row in cur.fetchall():
    print(f"  Result={row[0]}: {row[1]}")

print("\n=== Registration_Status table ===")
cur.execute("SELECT * FROM Registration_Status")
cols = [d[0] for d in cur.description]
print(f"  Columns: {cols}")
for row in cur.fetchall():
    print(f"  {row}")

print("\n=== Registration_Type table ===")
cur.execute("SELECT * FROM Registration_Type")
cols = [d[0] for d in cur.description]
print(f"  Columns: {cols}")
for row in cur.fetchall():
    print(f"  {row}")

# Combinations to find 1922
print("\n=== Trying filters to get 1922 ===")
# InActive = 0 or NULL
cur.execute("SELECT COUNT(DISTINCT Student_Number) FROM Registration WHERE Academic_Year = '25-26' AND (InActive = 0 OR InActive IS NULL)")
print(f"InActive=0 or NULL: {cur.fetchone()[0]}")

cur.execute("SELECT COUNT(DISTINCT Student_Number) FROM Registration WHERE Academic_Year = '25-26' AND InActive = 0")
print(f"InActive=0: {cur.fetchone()[0]}")

cur.execute("SELECT COUNT(DISTINCT Student_Number) FROM Registration WHERE Academic_Year = '25-26' AND Termination_Date IS NULL")
print(f"Termination_Date IS NULL: {cur.fetchone()[0]}")

cur.execute("SELECT COUNT(DISTINCT Student_Number) FROM Registration WHERE Academic_Year = '25-26' AND InActive = 0 AND Termination_Date IS NULL")
print(f"InActive=0 AND Termination_Date IS NULL: {cur.fetchone()[0]}")

cur.execute("SELECT COUNT(DISTINCT Student_Number) FROM Registration WHERE Academic_Year = '25-26' AND Termination_Reason_Code IS NULL")
print(f"Termination_Reason_Code IS NULL: {cur.fetchone()[0]}")

# Check the vw_RegisteredStudents view for 25-26
print("\n=== vw_RegisteredStudents for 25-26 ===")
try:
    cur.execute("SELECT TOP 1 * FROM vw_RegisteredStudents")
    cols = [d[0] for d in cur.description]
    print(f"  Columns: {cols}")
    year_col = [c for c in cols if 'year' in c.lower() or 'academic' in c.lower()]
    print(f"  Year columns: {year_col}")
    if year_col:
        yc = year_col[0]
        cur.execute(f"SELECT COUNT(*) FROM vw_RegisteredStudents WHERE [{yc}] = '25-26'")
        print(f"  Count for 25-26: {cur.fetchone()[0]}")
except Exception as e:
    print(f"  Error: {e}")

conn.close()

"""Check tbOtherIds for student iqama numbers - fixed."""
import pyodbc

conn = pyodbc.connect(
    r"DRIVER={ODBC Driver 17 for SQL Server};"
    r"SERVER=localhost\SQLEXPRESS;"
    r"DATABASE=_bak_import_temp;"
    r"Trusted_Connection=yes;"
)
c = conn.cursor()

# Count by OtherId_Code
print("=== tbOtherIds by OtherId_Code ===")
c.execute("SELECT OtherId_Code, COUNT(*) as cnt FROM tbOtherIds GROUP BY OtherId_Code ORDER BY cnt DESC")
for r in c.fetchall():
    print(f"  Code '{r[0]}': {r[1]:,} records")

# Count by OtherId_Source  
print("\n=== tbOtherIds by OtherId_Source ===")
c.execute("SELECT OtherId_Source, COUNT(*) as cnt FROM tbOtherIds GROUP BY OtherId_Source ORDER BY cnt DESC")
for r in c.fetchall():
    print(f"  Source '{r[0].strip() if r[0] else 'NULL'}': {r[1]:,} records")

# Sample data
print("\n=== Sample tbOtherIds (10 per code) ===")
c.execute("SELECT DISTINCT OtherId_Code FROM tbOtherIds")
codes = [r[0] for r in c.fetchall()]
for code in codes:
    c.execute(f"SELECT TOP 5 Source_Number, OtherId_Value, OtherId_Code FROM tbOtherIds WHERE OtherId_Code = ?", code)
    print(f"\n  Code '{code}':")
    for r in c.fetchall():
        print(f"    Student/Source={r[0]}, Value={r[1]}")

# How many students have entries?
print("\n=== Student coverage ===")
c.execute("SELECT COUNT(DISTINCT Source_Number) FROM tbOtherIds WHERE OtherId_Source = 'S'")
r = c.fetchone()
print(f"  Distinct students in tbOtherIds (Source='S'): {r[0] if r else 'N/A'}")

c.execute("SELECT COUNT(DISTINCT Source_Number) FROM tbOtherIds")
print(f"  Distinct Source_Numbers total: {c.fetchone()[0]}")

# FatherId coverage
print("\n=== FatherId coverage ===")
c.execute("SELECT COUNT(*) FROM Family WHERE FatherId IS NOT NULL AND FatherId != ''")
print(f"  Families with FatherId: {c.fetchone()[0]}")
c.execute("SELECT COUNT(*) FROM Family")
print(f"  Total families: {c.fetchone()[0]}")

# Sample FatherIds
print("\n=== Sample FatherIds ===")
c.execute("SELECT TOP 10 Family_Number, FatherId, E_Family_Name FROM Family WHERE FatherId IS NOT NULL AND FatherId != ''")
for r in c.fetchall():
    print(f"  Family {r[0]}: FatherId={r[1]}, Name={r[2]}")

conn.close()

import pyodbc
conn = pyodbc.connect(r"DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\SQLEXPRESS;DATABASE=_bak_import_temp;Trusted_Connection=yes;")
c = conn.cursor()

c.execute("SELECT COUNT(*) FROM Grades")
print(f"Grades: {c.fetchone()[0]:,}")

c.execute("SELECT COUNT(*) FROM Section_Avg")
print(f"Section_Avg: {c.fetchone()[0]:,}")

c.execute("SELECT COUNT(*) FROM Sponsor")
print(f"Sponsor: {c.fetchone()[0]:,}")

c.execute("SELECT COUNT(*) FROM tbOtherIds")
print(f"tbOtherIds: {c.fetchone()[0]:,}")

c.execute("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Grades' ORDER BY ORDINAL_POSITION")
print("\nGrades columns:")
for r in c.fetchall():
    print(f"  {r[0]}: {r[1]}")

c.execute("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Sponsor' ORDER BY ORDINAL_POSITION")
print("\nSponsor columns:")
for r in c.fetchall():
    print(f"  {r[0]}: {r[1]}")

conn.close()

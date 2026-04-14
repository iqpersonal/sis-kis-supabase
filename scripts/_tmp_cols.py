import pyodbc
conn = pyodbc.connect(r"DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\SQLEXPRESS;DATABASE=_bak_import_temp;Trusted_Connection=yes")
cur = conn.cursor()
cur.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Student' AND COLUMN_NAME LIKE '%ame%'")
for r in cur.fetchall():
    print(r[0])
# Also check a sample student row
cur.execute("SELECT TOP 1 * FROM Student")
cols = [c[0] for c in cur.description]
row = cur.fetchone()
print("\n--- All Student columns ---")
for c in cols:
    print(f"  {c}")
conn.close()

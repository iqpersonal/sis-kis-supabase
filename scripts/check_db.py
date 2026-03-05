"""Check if the temp DB is still in SQL Server."""
import pyodbc

conn = pyodbc.connect(
    "DRIVER={SQL Server};SERVER=localhost\\SQLEXPRESS;DATABASE=master;Trusted_Connection=yes;",
    autocommit=True
)
cursor = conn.cursor()
cursor.execute("SELECT name FROM sys.databases WHERE name = '_bak_import_temp'")
row = cursor.fetchone()
print("Temp DB exists:", row is not None)

if not row:
    # Check all databases
    cursor.execute("SELECT name FROM sys.databases")
    for r in cursor.fetchall():
        print(f"  DB: {r[0]}")
    
conn.close()

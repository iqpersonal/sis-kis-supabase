"""Quick test: verify SQL Server connection via db_config."""
from db_config import connect_sql

conn = connect_sql()
cursor = conn.cursor()

cursor.execute("SELECT DB_NAME() AS db, @@SERVERNAME AS svr, SUSER_NAME() AS login")
r = cursor.fetchone()
print(f"Connected!  DB={r.db}  Server={r.svr}  Login={r.login}")

cursor.execute("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE'")
print(f"Base tables: {cursor.fetchone()[0]}")

cursor.execute("SELECT TOP 5 TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME")
for row in cursor.fetchall():
    print(f"  - {row.TABLE_NAME}")

conn.close()
print("Done.")

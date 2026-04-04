import pyodbc
conn = pyodbc.connect(
    "DRIVER={ODBC Driver 17 for SQL Server};"
    "SERVER=172.16.1.160\\SQL2016;"
    "DATABASE=SIS;"
    "UID=sis_reader;"
    "PWD=Sis@12345Reader;"
)
c = conn.cursor()
c.execute("""
    SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME LIKE '%Child%' OR TABLE_NAME LIKE '%Student%'
    ORDER BY TABLE_NAME
""")
for r in c.fetchall():
    print(r[0])
conn.close()

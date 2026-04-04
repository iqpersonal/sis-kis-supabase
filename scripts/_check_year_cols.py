"""Check if Section_Avg and other NO_YEAR tables actually have Academic_Year."""
from db_config import connect_sql

conn = connect_sql()
cur = conn.cursor()

tables = ["Section_Avg", "Family", "Family_Children", "Employee", "Registration_Status"]
for t in tables:
    cur.execute(f"SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '{t}' AND COLUMN_NAME = 'Academic_Year'")
    has_year = bool(cur.fetchone())
    if has_year:
        cur.execute(f"SELECT COUNT(*) FROM [{t}]")
        total = cur.fetchone()[0]
        print(f"  {t}: HAS Academic_Year, {total} rows")
    else:
        cur.execute(f"SELECT COUNT(*) FROM [{t}]")
        total = cur.fetchone()[0]
        print(f"  {t}: NO Academic_Year, {total} rows")

conn.close()

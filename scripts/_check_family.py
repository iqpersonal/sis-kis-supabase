"""Quick check: find all students in a family from SQL."""
from db_config import connect_sql

conn = connect_sql()
cur = conn.cursor()

fam = "0021-4521"

# Check Registration table for both students
cur.execute("""
    SELECT r.Student_Number, r.School_Code, r.Academic_Year, r.Class_Code, r.Section_Code, r.Status_Code
    FROM dbo.Registration r
    WHERE r.Student_Number IN (
        SELECT Student_Number FROM dbo.Student WHERE Family_Number = ?
    )
    ORDER BY r.Student_Number, r.Academic_Year
""", fam)

rows = cur.fetchall()
print(f"Registrations for family {fam}: {len(rows)}")
for r in rows:
    print(f"  {r.Student_Number} | school={r.School_Code} | year={r.Academic_Year} | class={r.Class_Code} | section={r.Section_Code} | status={r.Status_Code}")

conn.close()

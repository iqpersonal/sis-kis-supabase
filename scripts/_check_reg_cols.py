"""Quick check of Registration table columns in live SQL Server."""
from db_config import connect_sql

conn = connect_sql()
cur = conn.cursor()

cur.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Registration' ORDER BY ORDINAL_POSITION")
reg_cols = [r[0] for r in cur.fetchall()]
print("Registration columns:", reg_cols)

# Also check Student table
cur.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Student' ORDER BY ORDINAL_POSITION")
stu_cols = [r[0] for r in cur.fetchall()]
print("\nStudent columns:", stu_cols)

# Check Registration_Status table
cur.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Registration_Status' ORDER BY ORDINAL_POSITION")
rs_cols = [r[0] for r in cur.fetchall()]
print("\nRegistration_Status columns:", rs_cols)

conn.close()

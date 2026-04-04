"""Dump tblStaff and tblStaffPersons schemas + sample data."""
import pyodbc

drivers = [d for d in pyodbc.drivers() if "SQL Server" in d]
conn = pyodbc.connect(
    f"DRIVER={{{drivers[0]}}};SERVER=localhost\\SQLEXPRESS;"
    f"DATABASE=_bak_import_temp;Trusted_Connection=yes;",
    autocommit=True,
)
cursor = conn.cursor()

for table in ["tblStaff", "tblStaffPersons", "Section", "Department", "Staff"]:
    print(f"\n{'='*60}")
    print(f"TABLE: {table}")
    print(f"{'='*60}")
    cursor.execute(
        "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH "
        f"FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '{table}' "
        "ORDER BY ORDINAL_POSITION"
    )
    cols = cursor.fetchall()
    for r in cols:
        print(f"  {r[0]:<40} {r[1]:<15} {str(r[2] or '')}")

    # Sample data
    cursor.execute(f"SELECT COUNT(*) FROM [{table}]")
    cnt = cursor.fetchone()[0]
    print(f"\n  Total rows: {cnt}")
    if cnt > 0:
        cursor.execute(f"SELECT TOP 2 * FROM [{table}]")
        dcols = [c[0] for c in cursor.description]
        for row in cursor.fetchall():
            print("\n  --- Sample ---")
            for c, v in zip(dcols, row):
                if v is not None:
                    print(f"    {c}: {repr(v)[:100]}")

conn.close()

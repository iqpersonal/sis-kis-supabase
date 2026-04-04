import pyodbc
import sys
sys.stdout.reconfigure(encoding='utf-8')

conn = pyodbc.connect('DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\\SQLEXPRESS;DATABASE=_bak_import_temp;Trusted_Connection=yes')
cursor = conn.cursor()

def print_columns(table_name):
    print(f'\n{"="*60}')
    print(f'=== {table_name} Columns ===')
    print(f'{"="*60}')
    try:
        cursor.execute(f"SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '{table_name}' ORDER BY ORDINAL_POSITION")
        rows = cursor.fetchall()
        if not rows:
            print(f'(No table named {table_name} found)')
        for r in rows:
            print(r[0])
    except Exception as e:
        print(f'Error: {e}')

def print_query(label, sql, max_rows=20):
    print(f'\n{"="*60}')
    print(f'=== {label} ===')
    print(f'{"="*60}')
    try:
        cursor.execute(sql)
        cols = [c[0] for c in cursor.description]
        print(' | '.join(cols))
        print('-' * 80)
        for r in cursor.fetchall():
            print(' | '.join(str(v) for v in r))
    except Exception as e:
        print(f'Error: {e}')

# 1. Family_Children columns
print_columns('Family_Children')

# 2. Student columns
print_columns('Student')

# 3. Subject columns
print_columns('Subject')

# 4. Registration columns
print_columns('Registration')

# 5. Family columns
print_columns('Family')

# 6. Sample Subject data
print_query('Subject Sample Data (TOP 20)', 'SELECT TOP 20 * FROM Subject')

# 7. Nationality columns + sample
print_columns('Nationality')
print_query('Nationality Sample Data (TOP 5)', 'SELECT TOP 5 * FROM Nationality')

# 8. Exam columns + all data
print_columns('Exam')
print_query('All Exam Data', 'SELECT * FROM Exam ORDER BY Exam_Code')

# 9. Class columns
print_columns('Class')

# 10. Sample data for Amina
print_query('Amina Ibrahim Daoud lookup', """
    SELECT fc.*, f.E_Family_Name, f.A_Family_Name 
    FROM Family_Children fc 
    JOIN Student s ON fc.Family_Number = s.Family_Number AND fc.Child_Number = s.Child_Number
    JOIN Family f ON fc.Family_Number = f.Family_Number
    WHERE fc.E_Child_Name LIKE '%Amina%'
""")

conn.close()
print('\n\nDone.')

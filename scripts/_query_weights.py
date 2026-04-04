"""Quick query to inspect Class_Exams weights from live SQL."""
from db_config import connect_sql

conn = connect_sql()
cursor = conn.cursor()

# 0. Find correct column names
cursor.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Class' ORDER BY ORDINAL_POSITION")
class_cols = [r[0] for r in cursor.fetchall()]
print(f"Class table columns: {class_cols}")
# Find the English name column
name_col = next((c for c in class_cols if 'name' in c.lower() and ('e_' in c.lower() or 'eng' in c.lower())), None)
if not name_col:
    name_col = next((c for c in class_cols if 'name' in c.lower()), 'Class_Code')
print(f"Using name column: {name_col}")

# 1. Show all Class_Exams weights for 25-26
print("\n" + "=" * 120)
print("CLASS_EXAMS WEIGHTS FOR 25-26 (ALL CLASSES)")
print("=" * 120)
cursor.execute(f"""
SELECT ce.Class_Code, c.{name_col}, ce.Major_Code, ce.Group_Code,
       ce.Exam_Code, e.E_Exam_Desc, 
       ce.Exam_Weight, ce.Sequence, ce.IsTerm, ce.FinalExam, ce.Current_Exam
FROM Class_Exams ce
JOIN Class c ON ce.Class_Code = c.Class_Code
JOIN Exams e ON ce.Exam_Code = e.Exam_Code
WHERE ce.Academic_Year = '25-26'
ORDER BY ce.Major_Code, ce.Class_Code, ce.Sequence
""")
header = f"{'Class':<7} {'ClassName':<22} {'Major':<8} {'Grp':<5} {'Exam':<6} {'ExamDesc':<28} {'Weight':<8} {'Seq':<5} {'Term':<6} {'Final':<7} {'Curr'}"
print(header)
print("-" * 120)
prev_class = None
for r in cursor.fetchall():
    if prev_class and r[0] != prev_class:
        print()
    prev_class = r[0]
    print(f"{str(r[0]):<7} {str(r[1]):<22} {str(r[2]):<8} {str(r[3]):<5} {str(r[4]):<6} {str(r[5]):<28} {str(r[6]):<8} {str(r[7]):<5} {str(r[8]):<6} {str(r[9]):<7} {r[10]}")

# 2. Show a summary: do weights differ across classes?
print("\n" + "=" * 120)
print("SUMMARY: UNIQUE WEIGHT PATTERNS PER CLASS (25-26)")
print("=" * 120)
cursor.execute(f"""
SELECT ce.Class_Code, c.{name_col}, ce.Major_Code,
       STRING_AGG(CONCAT(ce.Exam_Code, ':', CAST(ce.Exam_Weight AS VARCHAR)), ', ') 
         WITHIN GROUP (ORDER BY ce.Sequence) AS weight_pattern
FROM Class_Exams ce
JOIN Class c ON ce.Class_Code = c.Class_Code
WHERE ce.Academic_Year = '25-26'
GROUP BY ce.Class_Code, c.{name_col}, ce.Major_Code
ORDER BY ce.Major_Code, ce.Class_Code
""")
print(f"{'Class':<7} {'ClassName':<22} {'Major':<8} {'Weight Pattern (ExamCode:Weight)'}")
print("-" * 120)
for r in cursor.fetchall():
    print(f"{str(r[0]):<7} {str(r[1]):<22} {str(r[2]):<8} {r[3]}")

# 3. Also check 24-25 for comparison
print("\n" + "=" * 120)
print("SUMMARY: UNIQUE WEIGHT PATTERNS PER CLASS (24-25)")
print("=" * 120)
cursor.execute(f"""
SELECT ce.Class_Code, c.{name_col}, ce.Major_Code,
       STRING_AGG(CONCAT(ce.Exam_Code, ':', CAST(ce.Exam_Weight AS VARCHAR)), ', ') 
         WITHIN GROUP (ORDER BY ce.Sequence) AS weight_pattern
FROM Class_Exams ce
JOIN Class c ON ce.Class_Code = c.Class_Code
WHERE ce.Academic_Year = '24-25'
GROUP BY ce.Class_Code, c.{name_col}, ce.Major_Code
ORDER BY ce.Major_Code, ce.Class_Code
""")
print(f"{'Class':<7} {'ClassName':<22} {'Major':<8} {'Weight Pattern (ExamCode:Weight)'}")
print("-" * 120)
for r in cursor.fetchall():
    print(f"{str(r[0]):<7} {str(r[1]):<22} {str(r[2]):<8} {r[3]}")

# 4. Total row count
cursor.execute("SELECT COUNT(*) FROM Class_Exams")
print(f"\nTotal Class_Exams rows: {cursor.fetchone()[0]}")

cursor.execute("SELECT DISTINCT Academic_Year FROM Class_Exams ORDER BY Academic_Year")
print("Years:", [r[0] for r in cursor.fetchall()])

conn.close()
print("\nDone.")

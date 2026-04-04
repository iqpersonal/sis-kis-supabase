"""Analyze the school's official StudentID/Iqama query logic from tbOtherIds."""
import pyodbc

conn = pyodbc.connect(
    r"DRIVER={ODBC Driver 17 for SQL Server};"
    r"SERVER=localhost\SQLEXPRESS;"
    r"DATABASE=_bak_import_temp;"
    r"Trusted_Connection=yes;"
)
c = conn.cursor()

# 1. How many student iqamas via tbOtherIds (the CORRECT source)?
print("=" * 70)
print("IQAMA SOURCE: tbOtherIds (OtherId_Source='C', OtherId_Code IN 02,03)")
print("=" * 70)

c.execute("""
    SELECT COUNT(DISTINCT Source_Number)
    FROM tbOtherIds
    WHERE OtherId_Source = 'C'
      AND OtherId_Code IN ('02', '03')
      AND OtherId_Value IS NOT NULL
      AND OtherId_Value != ''
""")
print(f"\nDistinct students with iqama via tbOtherIds: {c.fetchone()[0]:,}")

# Breakdown by code
c.execute("""
    SELECT OtherId_Code, COUNT(DISTINCT Source_Number) as students, COUNT(*) as records
    FROM tbOtherIds
    WHERE OtherId_Source = 'C'
      AND OtherId_Code IN ('02', '03')
      AND OtherId_Value IS NOT NULL AND OtherId_Value != ''
    GROUP BY OtherId_Code
""")
for r in c.fetchall():
    print(f"  Code '{r[0]}': {r[1]:,} students, {r[2]:,} records")

# 2. Compare with current source (vwStudentDetails.ID_Number)
print(f"\n{'=' * 70}")
print("COMPARISON: Old vs New iqama source")
print(f"{'=' * 70}")

c.execute("""
    SELECT COUNT(DISTINCT Student_Number)
    FROM vwStudentDetails
    WHERE ID_Number IS NOT NULL AND ID_Number != ''
""")
old_count = c.fetchone()[0]
print(f"  OLD (vwStudentDetails.ID_Number): {old_count:,} students")

c.execute("""
    SELECT COUNT(DISTINCT Source_Number)
    FROM tbOtherIds
    WHERE OtherId_Source = 'C'
      AND OtherId_Code IN ('02', '03')
      AND OtherId_Value IS NOT NULL AND OtherId_Value != ''
""")
new_count = c.fetchone()[0]
print(f"  NEW (tbOtherIds Code 02/03):      {new_count:,} students")
print(f"  IMPROVEMENT:                       {new_count - old_count:,} more students ({new_count/old_count:.1f}x)")

# 3. Sample: show some students with their iqama from tbOtherIds
print(f"\n{'=' * 70}")
print("SAMPLE: Students with iqama from tbOtherIds")
print(f"{'=' * 70}")

c.execute("""
    SELECT TOP 10
        o.Source_Number AS Student_Number,
        o.OtherId_Value AS Iqama,
        o.OtherId_Code AS Code,
        fc.E_Child_Name,
        f.E_Family_Name
    FROM tbOtherIds o
    LEFT JOIN Student s ON o.Source_Number = s.Student_Number
    LEFT JOIN Family_Children fc ON s.Family_Number = fc.Family_Number
        AND s.Child_Number = fc.Child_Number
    LEFT JOIN Family f ON s.Family_Number = f.Family_Number
    WHERE o.OtherId_Source = 'C'
      AND o.OtherId_Code IN ('02', '03')
      AND o.OtherId_Value IS NOT NULL AND o.OtherId_Value != ''
    ORDER BY o.Source_Number
""")
for r in c.fetchall():
    print(f"  {r[3] or '?'} {r[4] or '?'} ({r[0]}): Iqama={r[1]} (Code {r[2]})")

# 4. Check: students who have BOTH codes 02 and 03 (do we need dedup?)
print(f"\n{'=' * 70}")
print("DEDUP CHECK: Students with multiple iqama records")
print(f"{'=' * 70}")

c.execute("""
    SELECT Source_Number, COUNT(*) as cnt
    FROM tbOtherIds
    WHERE OtherId_Source = 'C'
      AND OtherId_Code IN ('02', '03')
      AND OtherId_Value IS NOT NULL AND OtherId_Value != ''
    GROUP BY Source_Number
    HAVING COUNT(*) > 1
""")
dupes = c.fetchall()
print(f"  Students with >1 iqama record: {len(dupes)}")
if dupes:
    # Show first 5 duplicates
    for d in dupes[:5]:
        c.execute("""
            SELECT OtherId_Code, OtherId_Value
            FROM tbOtherIds
            WHERE Source_Number = ? AND OtherId_Source = 'C' AND OtherId_Code IN ('02','03')
        """, d[0])
        vals = [(r[0], r[1]) for r in c.fetchall()]
        print(f"    {d[0]}: {vals}")

# 5. Check: does Source_Number match Student_Number format?
print(f"\n{'=' * 70}")
print("FORMAT CHECK")
print(f"{'=' * 70}")

c.execute("""
    SELECT TOP 5 o.Source_Number, s.Student_Number
    FROM tbOtherIds o
    LEFT JOIN Student s ON o.Source_Number = s.Student_Number
    WHERE o.OtherId_Source = 'C' AND o.OtherId_Code IN ('02','03')
      AND s.Student_Number IS NOT NULL
""")
for r in c.fetchall():
    print(f"  tbOtherIds.Source_Number='{r[0]}' → Student.Student_Number='{r[1]}' (match: {r[0].strip() == r[1].strip()})")

# 6. Check Al Walid Saleh specifically
print(f"\n{'=' * 70}")
print("SPECIFIC CHECK: Al Walid Saleh")
print(f"{'=' * 70}")

c.execute("""
    SELECT s.Student_Number, fc.E_Child_Name, f.E_Family_Name, s.Password,
           o.OtherId_Value AS Iqama, o.OtherId_Code
    FROM Student s
    LEFT JOIN Family_Children fc ON s.Family_Number = fc.Family_Number AND s.Child_Number = fc.Child_Number
    LEFT JOIN Family f ON s.Family_Number = f.Family_Number
    LEFT JOIN tbOtherIds o ON s.Student_Number = o.Source_Number
        AND o.OtherId_Source = 'C' AND o.OtherId_Code IN ('02','03')
    WHERE fc.E_Child_Name LIKE '%Walid%' AND f.E_Family_Name LIKE '%Saleh%'
""")
for r in c.fetchall():
    print(f"  {r[1]} {r[2]} ({r[0]}): Passport={r[3]}, Iqama={r[4]} (Code {r[5]})")

conn.close()

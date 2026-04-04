import pyodbc
conn = pyodbc.connect(r'DRIVER={ODBC Driver 17 for SQL Server};SERVER=localhost\SQLEXPRESS;DATABASE=_bak_import_temp;Trusted_Connection=yes;')
c = conn.cursor()

# Verify Abdalla Hamed Abdelsalam Elsayed Aly (Student# 0021-303311) 
# Check all transcript fields
sn = '0021-303311'
print(f"=== Full data audit for Student# {sn} ===")

# Child name from Family_Children + Family
c.execute("""
SELECT fc.E_Child_Name, fc.A_Child_Name, fc.Gender,
       fc.Child_Birth_Date, fc.E_Child_Birth_Place, fc.A_Child_Birth_Place,
       fc.Nationality_Code_Primary,
       f.E_Family_Name, f.A_Family_Name,
       f.E_Father_Name, f.A_Father_Name,
       f.E_Grand_Father, f.A_Grand_Father
FROM Student s
JOIN Family_Children fc ON s.Family_Number = fc.Family_Number
    AND s.Family_Sub = fc.Family_Sub AND s.Child_Number = fc.Child_Number
JOIN Family f ON s.Family_Number = f.Family_Number
WHERE s.Student_Number = ?
""", sn)
r = c.fetchone()
if r:
    print(f"  Student Name: {r.E_Child_Name} {r.E_Father_Name} {r.E_Grand_Father} {r.E_Family_Name}")
    print(f"  Gender: {'Male' if r.Gender else 'Female'}")
    print(f"  DOB: {r.Child_Birth_Date}")
    print(f"  Birth Place: {r.E_Child_Birth_Place}")
    print(f"  Nationality Code: {r.Nationality_Code_Primary}")
    
    # Nationality name
    c.execute("SELECT E_Nationality_Name FROM Nationality WHERE Nationality_Code = ?", 
              str(r.Nationality_Code_Primary or '').strip())
    nr = c.fetchone()
    print(f"  Nationality: {nr.E_Nationality_Name if nr else 'NOT FOUND'}")

# Enrollment date
c.execute("SELECT Enrollment_Date FROM Student WHERE Student_Number = ?", sn)
er = c.fetchone()
print(f"  Enrollment Date: {er.Enrollment_Date if er else 'NOT FOUND'}")

# Passport from tbOtherIds (CORRECT source)
c.execute("""
SELECT OtherId_Value FROM tbOtherIds
WHERE OtherId_Source = 'C' AND OtherId_Code = '01' AND Source_Number = ?
""", sn)
pr = c.fetchone()
print(f"  Passport (tbOtherIds C/01): {pr.OtherId_Value if pr else 'NOT FOUND'}")

# Password from Student (WRONG source used previously)
c.execute("SELECT Password FROM Student WHERE Student_Number = ?", sn)
wr = c.fetchone()
print(f"  Student.Password (WRONG): {wr.Password if wr else 'NOT FOUND'}")

# Iqama from tbOtherIds
c.execute("""
SELECT OtherId_Value FROM tbOtherIds
WHERE OtherId_Source = 'C' AND OtherId_Code IN ('02','03') AND Source_Number = ?
ORDER BY OtherId_Code DESC
""", sn)
ir = c.fetchone()
print(f"  Iqama (tbOtherIds C/02-03): {ir.OtherId_Value if ir else 'NOT FOUND'}")

# Previous school
c.execute("""
SELECT Academic_Year, COALESCE(E_Local_School_Name, E_Foreign_School_Name, '') AS prev_school
FROM vwStudentPreviousSchools WHERE Student_Number = ?
""", sn)
ps = c.fetchone()
print(f"  Previous School: {ps.prev_school if ps else 'NOT FOUND'} (Year: {ps.Academic_Year if ps else 'N/A'})")

# Registration history (grades)
print(f"\n  Registration history:")
c.execute("""
SELECT r.Academic_Year, r.Class_Code FROM Registration r
WHERE r.Student_Number = ? ORDER BY r.Academic_Year
""", sn)
for reg in c.fetchall():
    print(f"    Year={reg.Academic_Year} Class={reg.Class_Code}")

# Now verify coverage stats
print("\n\n=== Passport coverage stats ===")
c.execute("SELECT COUNT(DISTINCT Student_Number) FROM Student")
total = c.fetchone()[0]
c.execute("""
SELECT COUNT(DISTINCT Source_Number) FROM tbOtherIds
WHERE OtherId_Source = 'C' AND OtherId_Code = '01'
  AND OtherId_Value IS NOT NULL AND LTRIM(RTRIM(OtherId_Value)) <> ''
""")
with_passport = c.fetchone()[0]
print(f"  Total students: {total}")
print(f"  Students with passport in tbOtherIds: {with_passport} ({100*with_passport/total:.1f}%)")
print(f"  Students without passport: {total - with_passport}")

conn.close()
print("\nDONE")

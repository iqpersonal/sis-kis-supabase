import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate('scripts/serviceAccountKey.json')
try:
    firebase_admin.get_app()
except:
    firebase_admin.initialize_app(cred)

db = firestore.client()

# Simulate the exact logic the diplomas page uses:
# 1. Load registrations for 25-26
# 2. Load students (all)
# 3. Build studentMap keyed by Student_Number
# 4. For each reg, lookup student by Student_Number

# Step 1: registrations
regs = list(db.collection('registrations').where('Academic_Year', '==', '25-26').stream())
print(f"Total registrations (25-26): {len(regs)}")

# Step 2: students (simulate limit 10000)
students = list(db.collection('students').limit(10000).stream())
print(f"Total students loaded: {len(students)}")

# Step 3: build map
student_map = {}
for s in students:
    d = s.to_dict()
    sn = str(d.get('Student_Number', ''))
    if sn:
        student_map[sn] = d

print(f"Student map size: {len(student_map)}")

# Step 4: check G12 regs
missing = []
found = []
for reg_doc in regs:
    r = reg_doc.to_dict()
    if r.get('Termination_Date'):
        continue
    cls = str(r.get('Class_Code', ''))
    if not cls.startswith('21'):  # G12
        continue
    sn = str(r.get('Student_Number', ''))
    stu = student_map.get(sn)
    if stu:
        fn = str(stu.get('E_Full_Name', '') or stu.get('E_Child_Name', '') or sn)
        found.append((sn, fn))
    else:
        missing.append(sn)

print(f"\nG12 active students found in map: {len(found)}")
print(f"G12 active students MISSING from map: {len(missing)}")

if missing:
    print("\nMISSING student numbers:")
    for sn in missing[:20]:
        print(f"  {sn}")

# Show some found
print("\nSample names:")
for sn, fn in found[:10]:
    print(f"  {sn} => '{fn}'")

import firebase_admin
from firebase_admin import credentials, firestore

if not firebase_admin._apps:
    cred = credentials.Certificate('serviceAccountKey.json')
    firebase_admin.initialize_app(cred)

db = firestore.client()

# Check student_progress for Boys School 25-26
print("=== Students in Boys School (0021-01) for 25-26 ===")
docs = db.collection('student_progress').get()

grade_counts = {}
grade_samples = {}

for doc in docs:
    d = doc.to_dict()
    years = d.get('years', {})
    y = years.get('25-26', {})
    if y.get('school') == '0021-01':
        grade = y.get('grade', 'Unknown')
        grade_counts[grade] = grade_counts.get(grade, 0) + 1
        if grade not in grade_samples:
            grade_samples[grade] = []
        if len(grade_samples[grade]) < 3:
            grade_samples[grade].append(doc.id)

print()
for g in sorted(grade_counts.keys()):
    print(f"  Grade {g}: {grade_counts[g]} students  (samples: {grade_samples[g]})")

print()
total = sum(grade_counts.values())
print(f"  TOTAL Boys students in 25-26: {total}")

# Check sections for Boys School Grade 4,5,6
print()
print("=== Sections for Boys School Grade 4,5,6 (25-26) ===")
secs = db.collection('sections').where('Academic_Year', '==', '25-26').where('Major_Code', '==', '0021-01').get()
for s in sorted(secs, key=lambda x: x.to_dict().get('Class_Code', 0)):
    sd = s.to_dict()
    cc = sd.get('Class_Code')
    if cc in [24, 25, 26]:
        desc = sd.get('Section_Desc', '')
        sc = sd.get('Student_Count', '?')
        print(f"  Class_Code={cc}  Section={desc}  Student_Count={sc}")

# Now check Girls School for comparison
print()
print("=== Students in Girls School (0021-02) for 25-26 ===")
grade_counts2 = {}
for doc in docs:
    d = doc.to_dict()
    years = d.get('years', {})
    y = years.get('25-26', {})
    if y.get('school') == '0021-02':
        grade = y.get('grade', 'Unknown')
        grade_counts2[grade] = grade_counts2.get(grade, 0) + 1

for g in sorted(grade_counts2.keys()):
    print(f"  Grade {g}: {grade_counts2[g]} students")

total2 = sum(grade_counts2.values())
print(f"  TOTAL Girls students in 25-26: {total2}")

# Check if Grade 4/5/6 sections exist in Girls School too
print()
print("=== Sections for Girls School Grade 4,5,6 (25-26) ===")
secs2 = db.collection('sections').where('Academic_Year', '==', '25-26').where('Major_Code', '==', '0021-02').get()
for s in sorted(secs2, key=lambda x: x.to_dict().get('Class_Code', 0)):
    sd = s.to_dict()
    cc = sd.get('Class_Code')
    if cc in [24, 25, 26]:
        desc = sd.get('Section_Desc', '')
        sc = sd.get('Student_Count', '?')
        print(f"  Class_Code={cc}  Section={desc}  Student_Count={sc}")

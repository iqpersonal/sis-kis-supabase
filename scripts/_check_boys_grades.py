import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate('serviceAccountKey.json')
app = firebase_admin.initialize_app(cred)
db = firestore.client()

# Check student_progress for students in Boys' School (0021-01) year 25-26
# with class codes 24 (Grade 4), 25 (Grade 5), 26 (Grade 6)
print("=== Students in Boys' School (0021-01) for year 25-26 ===\n")

progress_docs = db.collection('student_progress').get()

grade_counts = {}
grade_students = {}

for doc in progress_docs:
    d = doc.to_dict()
    years = d.get('years', {})
    if '25-26' not in years:
        continue
    year_data = years['25-26']
    school = year_data.get('school', '')
    if school != '0021-01':
        continue
    
    class_name = year_data.get('class_name', '')
    class_code = year_data.get('class_code', '')
    section = year_data.get('section_name', '')
    sn = d.get('student_number', doc.id)
    name = d.get('student_name', '')
    
    if class_name not in grade_counts:
        grade_counts[class_name] = 0
        grade_students[class_name] = []
    grade_counts[class_name] += 1
    if grade_counts[class_name] <= 3:  # Show first 3 students per grade
        grade_students[class_name].append(f"  {sn} - {name} ({section})")

print("Grade | Students | Sample")
print("-" * 60)
for grade in sorted(grade_counts.keys()):
    count = grade_counts[grade]
    print(f"{grade:15s} | {count:5d} students")
    for s in grade_students[grade]:
        print(s)
    print()

total = sum(grade_counts.values())
print(f"\nTotal Boys' School 25-26 students: {total}")

# Now check Girls' School for comparison
print("\n\n=== Students in Girls' School (0021-02) for year 25-26 ===\n")

girls_grade_counts = {}
for doc in progress_docs:
    d = doc.to_dict()
    years = d.get('years', {})
    if '25-26' not in years:
        continue
    year_data = years['25-26']
    school = year_data.get('school', '')
    if school != '0021-02':
        continue
    
    class_name = year_data.get('class_name', '')
    if class_name not in girls_grade_counts:
        girls_grade_counts[class_name] = 0
    girls_grade_counts[class_name] += 1

print("Grade | Students")
print("-" * 40)
for grade in sorted(girls_grade_counts.keys()):
    print(f"{grade:15s} | {girls_grade_counts[grade]:5d} students")

girls_total = sum(girls_grade_counts.values())
print(f"\nTotal Girls' School 25-26 students: {girls_total}")

# Also check sections collection for these grades
print("\n\n=== Sections in Boys' School (0021-01) for Grade 4/5/6 year 25-26 ===\n")
sections = db.collection('sections').where('Academic_Year', '==', '25-26').get()
for doc in sections:
    d = doc.to_dict()
    major = str(d.get('Major_Code', ''))
    cc = str(d.get('Class_Code', ''))
    if major.endswith('-01') and cc in ('24', '25', '26'):
        print(f"Section ID: {doc.id}, Class_Code: {cc}, Section: {d.get('E_Section_Name','')}, Major: {major}")

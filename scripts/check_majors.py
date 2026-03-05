import firebase_admin
from firebase_admin import credentials, firestore
from collections import Counter, defaultdict

app = firebase_admin.get_app() if firebase_admin._apps else firebase_admin.initialize_app(credentials.Certificate('serviceAccountKey.json'))
db = firestore.client()

# Get class descriptions per Major_Code
class_desc = {}
docs = db.collection('classes').stream()
for d in docs:
    data = d.to_dict()
    cc = str(data.get('Class_Code', ''))
    mc = data.get('Major_Code', '')
    desc = data.get('E_Class_Desc', '') or data.get('E_Class_Abbreviation', '')
    class_desc[(cc, mc)] = desc

# Get sections for 25-26 grouped by Major_Code
section_by_major = defaultdict(list)
docs2 = db.collection('sections').where('Academic_Year', '==', '25-26').limit(10000).stream()
for d in docs2:
    data = d.to_dict()
    mc = data.get('Major_Code', '')
    cc = str(data.get('Class_Code', ''))
    sc = str(data.get('Section_Code', ''))
    section_by_major[mc].append({'Class_Code': cc, 'Section_Code': sc})

# Get student counts per Class_Code + Major_Code from registrations 25-26
reg_counts = Counter()
docs3 = db.collection('registrations').where('Academic_Year', '==', '25-26').limit(10000).stream()
for d in docs3:
    data = d.to_dict()
    mc = data.get('Major_Code', '')
    cc = str(data.get('Class_Code', ''))
    reg_counts[(mc, cc)] += 1

# Print Boys School
print('========================================')
print("BOYS' SCHOOL (Major_Code = 0021-01)")
print('========================================')
for (cc, mc), desc in sorted(class_desc.items(), key=lambda x: int(x[0][0]) if x[0][0].isdigit() else 999):
    if mc == '0021-01':
        count = reg_counts.get(('0021-01', cc), 0)
        sections = [s for s in section_by_major['0021-01'] if s['Class_Code'] == cc]
        sec_list = ', '.join(s['Section_Code'] for s in sorted(sections, key=lambda x: x['Section_Code']))
        print(f"  Class {cc}: {desc:25s} | {count:4d} students | {len(sections):2d} sections ({sec_list})")

print()
print('========================================')
print("GIRLS' SCHOOL (Major_Code = 0021-02)")
print('========================================')
for (cc, mc), desc in sorted(class_desc.items(), key=lambda x: int(x[0][0]) if x[0][0].isdigit() else 999):
    if mc == '0021-02':
        count = reg_counts.get(('0021-02', cc), 0)
        sections = [s for s in section_by_major['0021-02'] if s['Class_Code'] == cc]
        sec_list = ', '.join(s['Section_Code'] for s in sorted(sections, key=lambda x: x['Section_Code']))
        print(f"  Class {cc}: {desc:25s} | {count:4d} students | {len(sections):2d} sections ({sec_list})")

print()
print('========================================')
print('SUMMARY')
print('========================================')
boys_total = sum(v for (mc, cc), v in reg_counts.items() if mc == '0021-01')
girls_total = sum(v for (mc, cc), v in reg_counts.items() if mc == '0021-02')
print(f"Boys' School total students (25-26): {boys_total}")
print(f"Girls' School total students (25-26): {girls_total}")
print(f"Grand total: {boys_total + girls_total}")

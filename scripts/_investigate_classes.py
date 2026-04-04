import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate('serviceAccountKey.json')
app = firebase_admin.initialize_app(cred)
db = firestore.client()

# 1. Find "Terminated" class codes
classes = db.collection('classes').get()
terminated_codes = set()
class_map = {}
for doc in classes:
    d = doc.to_dict()
    desc = d.get('E_Class_Desc', '') or d.get('E_Class_Abbreviation', '')
    code = d.get('Class_Code')
    class_map[code] = desc
    if 'Terminated' in str(desc) or 'terminated' in str(desc).lower():
        terminated_codes.add(code)
        print(f"Terminated class: code={code}, desc={desc}")

print(f"\nTerminated codes: {sorted(terminated_codes)}")
print(f"Total classes in collection: {len(classes)}")

# 2. Check sections for year 25-26 with Major_Code ending -01 (Boys)
sections = db.collection('sections').where('Academic_Year', '==', '25-26').get()
print(f"\nTotal sections for year 25-26: {len(sections)}")

boys_sections = []
girls_sections = []
no_campus = []

for doc in sections:
    d = doc.to_dict()
    major = str(d.get('Major_Code', ''))
    cc = d.get('Class_Code')
    section_name = d.get('E_Section_Name', '') or d.get('A_Section_Name', '')
    grade = class_map.get(cc, f'Unknown({cc})')
    
    entry = {
        'id': doc.id,
        'class_code': cc,
        'grade': grade,
        'section': section_name,
        'major_code': major,
    }
    
    if major.endswith('-01'):
        boys_sections.append(entry)
    elif major.endswith('-02'):
        girls_sections.append(entry)
    else:
        no_campus.append(entry)

print(f"\nBoys sections: {len(boys_sections)}")
print(f"Girls sections: {len(girls_sections)}")
print(f"No campus (empty/other Major_Code): {len(no_campus)}")

# 3. Show Boys sections grouped by grade
print("\n=== BOYS 25-26 Sections ===")
from collections import defaultdict
by_grade = defaultdict(list)
for s in boys_sections:
    by_grade[s['grade']].append(s)

for grade in sorted(by_grade.keys()):
    secs = by_grade[grade]
    print(f"\n  {grade} ({len(secs)} sections):")
    for s in sorted(secs, key=lambda x: x['section']):
        print(f"    Section: {s['section']}, Major_Code: {s['major_code']}, Class_Code: {s['class_code']}")

# 4. Show No-campus sections
if no_campus:
    print("\n=== NO CAMPUS SECTIONS (25-26) ===")
    for s in sorted(no_campus, key=lambda x: x['grade']):
        print(f"  Grade: {s['grade']}, Section: {s['section']}, Major_Code: {s['major_code']}")

# 5. Check a few Major_Code patterns
print("\n=== All unique Major_Codes for 25-26 ===")
major_codes = set()
for doc in sections:
    mc = doc.to_dict().get('Major_Code', '')
    major_codes.add(str(mc))
for mc in sorted(major_codes):
    print(f"  {mc}")

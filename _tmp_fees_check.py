import firebase_admin
from firebase_admin import credentials, firestore
import json

sa_key = None
with open('dashboard/.env.local', encoding='utf-8') as f:
    for line in f:
        if line.startswith('SA_KEY='):
            sa_key = json.loads(line[7:].strip())
            break

cred = credentials.Certificate(sa_key)
try:
    firebase_admin.initialize_app(cred)
except:
    pass
db = firestore.client()

# Get a few students - some with grade, some without
# Check what their years/financials keys look like
docs = db.collection('student_progress').limit(20).get()

no_class = []
has_class = []

for d in docs:
    data = d.to_dict()
    fin = data.get('financials', {})
    years_data = data.get('years', {})
    
    fin_keys = list(fin.keys()) if fin else []
    year_keys = list(years_data.keys()) if years_data else []
    
    # Check 25-26
    target = '25-26'
    fin_entry = fin.get(target, {})
    year_entry = years_data.get(target, {})
    class_name = year_entry.get('class_name', '')
    
    entry = {
        'id': d.id[:12],
        'name': data.get('student_name', '')[:25],
        'fin_keys': fin_keys,
        'year_keys': year_keys,
        'class_name_25_26': class_name,
        'has_fin_25_26': target in fin,
        'has_year_25_26': target in years_data,
    }
    if class_name:
        has_class.append(entry)
    else:
        no_class.append(entry)

print(f'With class_name: {len(has_class)}, Without: {len(no_class)}')
print()
print('=== WITHOUT class_name (first 5) ===')
for e in no_class[:5]:
    print(f"  {e['name']}")
    print(f"    fin_keys={e['fin_keys']}")
    print(f"    year_keys={e['year_keys']}")
    print(f"    has_fin_25_26={e['has_fin_25_26']}  has_year_25_26={e['has_year_25_26']}")
    print()

print('=== WITH class_name (first 3) ===')
for e in has_class[:3]:
    print(f"  {e['name']} → {e['class_name_25_26']}")
    print(f"    fin_keys={e['fin_keys']}")
    print(f"    year_keys={e['year_keys']}")
    print()

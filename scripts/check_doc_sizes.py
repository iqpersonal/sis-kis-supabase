"""Check which student documents might be too large for Firestore (1MB limit)."""
import json
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

# Import the pipeline functions
from generate_parent_data import *

SERVER = r"localhost\SQLEXPRESS"
TEMP_DB = "_bak_import_temp"

conn_str = (
    f"DRIVER={{ODBC Driver 17 for SQL Server}};"
    f"SERVER={SERVER};"
    f"DATABASE={TEMP_DB};"
    f"Trusted_Connection=yes;"
)
conn = pyodbc.connect(conn_str)
cursor = conn.cursor()

class_map = get_class_name_map(cursor)
section_map = get_section_name_map(cursor)
student_docs = build_student_progress(cursor, class_map, section_map)
add_financial_data(cursor, student_docs)

# Check sizes
sizes = []
for sn, doc in student_docs.items():
    raw = json.dumps(doc, ensure_ascii=False, default=str)
    size = len(raw.encode('utf-8'))
    sizes.append((sn, size, len(doc.get('years', {}))))

sizes.sort(key=lambda x: -x[1])

print(f"\nTotal docs: {len(sizes)}")
print(f"\nTop 20 largest documents:")
for sn, size, year_count in sizes[:20]:
    print(f"  {sn}: {size:,} bytes ({size/1024:.0f} KB), {year_count} years")

# Check if any exceed 1MB
over_limit = [s for s in sizes if s[1] > 1_000_000]
if over_limit:
    print(f"\n⚠️  {len(over_limit)} documents EXCEED 1MB!")
    for sn, size, yc in over_limit:
        print(f"  {sn}: {size:,} bytes ({size/1024/1024:.1f} MB)")
else:
    print("\n✓ No documents exceed 1MB")

# Also check near the 2900 mark to see what doc might have caused the issue
batch_start = 2850
batch_end = 2950
all_sns = sorted(student_docs.keys())
if batch_end <= len(all_sns):
    print(f"\nDocs around batch 58 (2850-2950):")
    for idx in range(batch_start, min(batch_end, len(all_sns))):
        sn = all_sns[idx]
        raw = json.dumps(student_docs[sn], ensure_ascii=False, default=str)
        size = len(raw.encode('utf-8'))
        if size > 500_000:
            print(f"  [{idx}] {sn}: {size:,} bytes ({size/1024:.0f} KB) ⚠️")

conn.close()

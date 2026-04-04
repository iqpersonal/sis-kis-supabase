"""Compare Grade 12 Boys' School 25-26 students from screenshot vs Firestore."""
import os
import firebase_admin
from firebase_admin import credentials, firestore

if not firebase_admin._apps:
    cred = credentials.Certificate(os.path.join(os.path.dirname(__file__), "serviceAccountKey.json"))
    firebase_admin.initialize_app(cred)

db = firestore.client()

# Screenshot students (26 students from Grade 12 Boys' School 25-26)
screenshot_students = [
    "Abdal Gabbar Shiek Khalil",
    "Abdulbari Alaidarous",
    "Abdullah Idrees",
    "Abdulrahman Elmenawy",
    "Abdulrahman Azzubi",
    "Ahmed Ewis",
    "Ali Zakkar",
    "Aown Abu Sara",
    "Badi Alkhatib",
    "Basil Mahmoud Ghazi",
    "Christian Makary",
    "Fouad Besisou",
    "George Lahdo",
    "Hamad Alaqeel",
    "Hoseb Kazanjian",
    "Husam Al Raiy",
    "Malek Malek",
    "Mark Toubia",
    "Mohammad Halawi",
    "Mohammed Hussein",
    "Muneer Almarastani",
    "Narek Kivork",
    "Nikolaos Ergas",
    "Tarek Shahin",
    "Ziyad Refaie",
    "Zouheir Abbas",
]

print(f"Screenshot: {len(screenshot_students)} students")
print()

# Get Firestore browse index
doc = db.collection("parent_config").document("browse_25-26").get()
data = doc.to_dict()
buckets = data.get("buckets", {})

# Grade 12 Boys' School buckets (33__*__0021-01)
g12_boys_keys = sorted([k for k in buckets.keys() if k.startswith("33__") and k.endswith("__0021-01")])

print("=== Grade 12 Boys' School sections in app ===")
all_app_students = []
for key in g12_boys_keys:
    students = buckets[key]
    print(f"\n  {key}: {len(students)} students")
    for s in sorted(students, key=lambda x: x.get("name", "")):
        print(f"    {s['name']} (SN: {s['sn']})")
        all_app_students.append(s)

print(f"\nTotal Grade 12 Boys in app: {len(all_app_students)}")

# Find which section the screenshot maps to
# The screenshot is section 03 (Melons Boys') based on our SQL query
section_03 = buckets.get("33__03__0021-01", [])
app_names_sec03 = sorted([s["name"] for s in section_03])
screenshot_sorted = sorted(screenshot_students)

print("\n\n=== COMPARISON: Screenshot vs Section 03 (Melons Boys') ===")
print(f"Screenshot: {len(screenshot_students)} students")
print(f"App (33__03__0021-01): {len(section_03)} students")

# Find matches and mismatches
app_name_set = set(s["name"].strip() for s in section_03)
screenshot_set = set(s.strip() for s in screenshot_students)

in_both = screenshot_set & app_name_set  
only_screenshot = screenshot_set - app_name_set
only_app = app_name_set - screenshot_set

print(f"\nMatched: {len(in_both)}")
print(f"Only in screenshot: {len(only_screenshot)}")
if only_screenshot:
    for n in sorted(only_screenshot):
        print(f"  - {n}")
print(f"Only in app: {len(only_app)}")
if only_app:
    for n in sorted(only_app):
        print(f"  + {n}")

# Also do fuzzy comparison for close matches
if only_screenshot or only_app:
    print("\n=== Possible fuzzy matches ===")
    for s_name in sorted(only_screenshot):
        for a_name in sorted(only_app):
            s_parts = set(s_name.lower().split())
            a_parts = set(a_name.lower().split())
            common = s_parts & a_parts
            if common:
                print(f"  Screenshot '{s_name}' <-> App '{a_name}' (shared: {common})")

# Also check all 3 sections combined
print("\n\n=== COMPARISON: Screenshot vs ALL Grade 12 Boys' sections ===")
all_app_name_set = set(s["name"].strip() for s in all_app_students)
in_both_all = screenshot_set & all_app_name_set
only_screenshot_all = screenshot_set - all_app_name_set
only_app_g12 = all_app_name_set - screenshot_set

print(f"Matched in any section: {len(in_both_all)}")
if only_screenshot_all:
    print(f"Screenshot students NOT in any Grade 12 Boys section ({len(only_screenshot_all)}):")
    for n in sorted(only_screenshot_all):
        print(f"  - {n}")

# Check Grade 12 Girls too
g12_girls_keys = sorted([k for k in buckets.keys() if k.startswith("33__") and k.endswith("__0021-02")])
print(f"\n=== Grade 12 Girls' sections ===")
all_girls = []
for key in g12_girls_keys:
    students = buckets[key]
    all_girls.extend(students)
    print(f"  {key}: {len(students)} students")
print(f"Total Grade 12 Girls in app: {len(all_girls)}")

print(f"\n=== GRAND TOTAL Grade 12 in app: {len(all_app_students) + len(all_girls)} students ===")
print(f"  Boys: {len(all_app_students)} (3 sections)")
print(f"  Girls: {len(all_girls)} ({len(g12_girls_keys)} sections)")

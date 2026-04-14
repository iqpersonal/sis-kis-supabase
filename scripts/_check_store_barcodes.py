import firebase_admin
from firebase_admin import credentials, firestore

if not firebase_admin._apps:
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)

db = firestore.client()

print("=== General Store Items ===")
docs = db.collection("gs_items").limit(10).stream()
for d in docs:
    data = d.to_dict()
    name = data.get("name", "?")
    barcode = data.get("barcode")
    item_id = data.get("item_id", "?")
    print(f"  doc_id={d.id}  name={name}  barcode={repr(barcode)}  item_id={item_id}")

print()
print("=== IT Store Items ===")
docs = db.collection("its_items").limit(10).stream()
for d in docs:
    data = d.to_dict()
    name = data.get("name", "?")
    barcode = data.get("barcode")
    item_id = data.get("item_id", "?")
    print(f"  doc_id={d.id}  name={name}  barcode={repr(barcode)}  item_id={item_id}")

# Also try querying by barcode to see if index works
print()
print("=== Testing barcode query on gs_items ===")
try:
    docs = db.collection("gs_items").where("barcode", "!=", "").limit(5).stream()
    count = 0
    for d in docs:
        data = d.to_dict()
        print(f"  Found: barcode={repr(data.get('barcode'))}  name={data.get('name')}")
        count += 1
    if count == 0:
        print("  No items with non-empty barcode found")
except Exception as e:
    print(f"  Query error: {e}")

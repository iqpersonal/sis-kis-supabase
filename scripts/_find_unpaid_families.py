import firebase_admin
from firebase_admin import credentials, firestore

if not firebase_admin._apps:
    cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)

db = firestore.client()
docs = db.collection("student_progress").stream()

results = []
for doc in docs:
    data = doc.to_dict()
    fin = data.get("financials", {})
    if not fin:
        continue
    unpaid_years = []
    for yr, f in fin.items():
        bal = f.get("balance", 0)
        if bal > 0:
            unpaid_years.append((yr, bal))
    # Only count years with balance > 1 SAR (skip rounding artifacts)
    unpaid_years = [(y, b) for y, b in unpaid_years if b > 1]
    if len(unpaid_years) >= 1:
        results.append({
            "student": doc.id,
            "name": data.get("student_name", ""),
            "family": data.get("family_number", ""),
            "unpaid": unpaid_years,
            "total_years": len(fin),
        })

# Sort by number of unpaid years descending
results.sort(key=lambda x: len(x["unpaid"]), reverse=True)

print("=== Students with most unpaid academic years ===\n")
for r in results[:15]:
    yrs_str = ", ".join("{}: {:.0f} SAR".format(y, b) for y, b in sorted(r["unpaid"]))
    print("Family: {} | Student: {} | {} | Unpaid: {}/{} years | {}".format(
        r["family"], r["student"], r["name"],
        len(r["unpaid"]), r["total_years"], yrs_str
    ))

if not results:
    print("No students with outstanding fees found.")

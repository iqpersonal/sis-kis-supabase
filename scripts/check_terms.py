import firebase_admin
from firebase_admin import credentials, firestore

if not firebase_admin._apps:
    firebase_admin.initialize_app(credentials.Certificate("serviceAccountKey.json"))
db = firestore.client()

# Check a few students
for sn in ["0021-35911", "0021-00601", "0021-0060101"]:
    doc = db.collection("student_progress").document(sn).get()
    if not doc.exists:
        print(f"{sn}: NOT FOUND")
        continue
    data = doc.to_dict()
    print(f"\n=== {sn}: {data.get('student_name', '?')} ===")
    years = data.get("years", {})
    for yr in sorted(years.keys()):
        yd = years[yr]
        has_terms = "terms" in yd and yd["terms"]
        tc = yd.get("term_count", "N/A")
        print(f"  {yr}: class={yd.get('class_name','')} | has_terms={has_terms} | term_count={tc}")
        if has_terms:
            for tk in sorted(yd["terms"].keys()):
                tv = yd["terms"][tk]
                print(f"    {tk}: {tv['label']} avg={tv['avg']} ({len(tv['subjects'])} subjects)")

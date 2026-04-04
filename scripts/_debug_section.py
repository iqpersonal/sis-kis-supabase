"""Quick debug: check section doc and registrations match."""
import firebase_admin
from firebase_admin import credentials, firestore
import os

KEY = os.path.join(os.path.dirname(__file__), "..", "dashboard", "serviceAccountKey.json")
if not firebase_admin._apps:
    firebase_admin.initialize_app(credentials.Certificate(KEY))
db = firestore.client()

SECTION_ID = "e17BQ4CdFaiIRBVhbrVM"

doc = db.collection("sections").document(SECTION_ID).get()
if doc.exists:
    d = doc.to_dict()
    print("Section doc fields:")
    for k in ["Class_Code", "Section_Code", "E_Section_Name", "A_Section_Name", "Academic_Year", "Major_Code"]:
        print(f"  {k}: {repr(d.get(k))}")
    
    cc = d.get("Class_Code", "")
    sc = d.get("Section_Code", "")
    
    print(f"\nQuerying registrations: Class_Code={repr(cc)}, Section_Code={repr(sc)}, Academic_Year='25-26'")
    regs = list(
        db.collection("registrations")
        .where("Class_Code", "==", str(cc))
        .where("Section_Code", "==", str(sc))
        .where("Academic_Year", "==", "25-26")
        .limit(5)
        .stream()
    )
    print(f"Found: {len(regs)} registrations")
    for r in regs[:3]:
        rd = r.to_dict()
        sn = rd.get("Student_Number", "?")
        td = rd.get("Termination_Date", None)
        print(f"  Student_Number={sn}  Termination_Date={td}")
    
    if len(regs) == 0:
        # Try without section code
        print(f"\nTrying without Section_Code...")
        regs2 = list(
            db.collection("registrations")
            .where("Class_Code", "==", str(cc))
            .where("Academic_Year", "==", "25-26")
            .limit(5)
            .stream()
        )
        print(f"Found: {len(regs2)} registrations (class only)")
        for r in regs2[:3]:
            rd = r.to_dict()
            sn = rd.get("Student_Number", "?")
            sc2 = rd.get("Section_Code", "?")
            mc = rd.get("Major_Code", "?")
            print(f"  Student_Number={sn}  Section_Code={sc2}  Major_Code={mc}")
        
        # Also check: what Section_Code values exist for this Class_Code?
        if regs2:
            codes = set()
            all_regs = list(
                db.collection("registrations")
                .where("Class_Code", "==", str(cc))
                .where("Academic_Year", "==", "25-26")
                .limit(200)
                .stream()
            )
            for r in all_regs:
                codes.add(r.to_dict().get("Section_Code"))
            print(f"\n  All Section_Code values for Class_Code={repr(cc)}: {sorted(codes)}")
else:
    print("Section doc NOT FOUND!")

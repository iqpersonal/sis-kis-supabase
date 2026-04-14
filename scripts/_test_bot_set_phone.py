"""
Temporarily set father_phone on one family to the test number so we can test the bot.
Pick a family with children that have student_progress data.
"""
import os, firebase_admin
from firebase_admin import credentials, firestore

SA_PATH = os.path.join(os.path.dirname(__file__), "..", "dashboard", "serviceAccountKey.json")
if not firebase_admin._apps:
    cred = credentials.Certificate(SA_PATH)
    firebase_admin.initialize_app(cred)

db = firestore.client()

TEST_PHONE = "966569670909"

# Find a good family to test with (has children + student_progress data)
print("Finding a family with children + progress data...")
families = db.collection("families").limit(50).get()

for fdoc in families:
    data = fdoc.to_dict()
    children = data.get("children", [])
    if len(children) < 1:
        continue
    
    # Check if first child has student_progress
    sn = children[0].get("student_number", "")
    if not sn:
        continue
    prog = db.collection("student_progress").document(sn).get()
    if not prog.exists:
        continue
    
    pdata = prog.to_dict()
    raw_student = pdata.get("raw_student", {})
    financials = pdata.get("financials", {})
    
    if raw_student.get("UserName") and financials:
        fn = data.get("family_number", "?")
        original_father_phone = data.get("father_phone", "")
        print(f"\nUsing family: {fn}")
        print(f"  Father: {data.get('father_name', '?')}")
        print(f"  Original father_phone: '{original_father_phone}'")
        print(f"  Children: {len(children)}")
        print(f"  First child: {children[0].get('child_name', '?')} ({sn})")
        
        # Set the test phone
        db.collection("families").document(fdoc.id).update({
            "father_phone": TEST_PHONE,
            "_original_father_phone": original_father_phone,  # backup
        })
        print(f"\n✅ Updated father_phone to '{TEST_PHONE}'")
        print(f"   Backup saved in _original_father_phone field")
        print(f"\n   Now send a WhatsApp message to the bot and test!")
        print(f"   When done, run: python scripts/_test_bot_restore.py {fn}")
        break
else:
    print("No suitable family found in first 50.")

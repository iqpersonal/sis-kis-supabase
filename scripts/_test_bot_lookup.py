"""
Test the WhatsApp bot phone lookup against Firestore families collection.
Simulates what the bot does when it receives a message.
"""
import os, sys, re

import firebase_admin
from firebase_admin import credentials, firestore

SA_PATH = os.path.join(os.path.dirname(__file__), "..", "dashboard", "serviceAccountKey.json")
if not firebase_admin._apps:
    cred = credentials.Certificate(SA_PATH)
    firebase_admin.initialize_app(cred)

db = firestore.client()

TEST_PHONE = "+966569670909"

def phone_digits(phone: str) -> str:
    return re.sub(r"\D", "", phone)

def normalize_phone(phone: str) -> str:
    cleaned = re.sub(r"[\s\-()]", "", phone)
    if not cleaned.startswith("+"):
        cleaned = "+" + cleaned
    if cleaned.startswith("+05"):
        cleaned = "+966" + cleaned[2:]
    if cleaned.startswith("+5") and len(cleaned) == 10:
        cleaned = "+966" + cleaned[1:]
    return cleaned

def main():
    normalized = normalize_phone(TEST_PHONE)
    input_digits = phone_digits(normalized)
    input_local = input_digits[-9:] if len(input_digits) >= 9 else input_digits

    print(f"Test phone: {TEST_PHONE}")
    print(f"Normalized: {normalized}")
    print(f"Digits:     {input_digits}")
    print(f"Local (last 9): {input_local}")
    print()

    # Fetch all families
    print("Fetching families collection...")
    snap = db.collection("families").get()
    print(f"Total families: {len(snap)}")
    print()

    # Search for match
    match = None
    for doc in snap:
        data = doc.to_dict()
        father_phone = str(data.get("father_phone", "") or "").strip()
        mother_phone = str(data.get("mother_phone", "") or "").strip()

        for field_name, stored_raw in [("father_phone", father_phone), ("mother_phone", mother_phone)]:
            if not stored_raw:
                continue
            stored_digits = phone_digits(stored_raw)
            stored_local = stored_digits[-9:] if len(stored_digits) >= 9 else stored_digits
            if stored_local and stored_local == input_local:
                match = data
                print(f"✅ MATCH FOUND via {field_name}!")
                print(f"   Stored raw: '{stored_raw}' → local digits: {stored_local}")
                break
        if match:
            break

    if not match:
        print("❌ No match found. Your number is NOT in any family's father_phone or mother_phone.")
        print()
        # Show a few sample phone formats from the DB
        print("Sample phone formats in DB (first 10 non-empty):")
        count = 0
        for doc in snap:
            data = doc.to_dict()
            fp = str(data.get("father_phone", "") or "").strip()
            mp = str(data.get("mother_phone", "") or "").strip()
            if fp or mp:
                print(f"  family={data.get('family_number', '?')}: father='{fp}', mother='{mp}'")
                count += 1
                if count >= 10:
                    break
        return

    # Show what the bot would return
    fn = match.get("family_number", "?")
    print(f"\n── Family: {fn} ──")
    print(f"Father: {match.get('father_name', '?')}")
    print(f"Username: {match.get('username', '?')}")
    print(f"Children: {len(match.get('children', []))}")

    for i, child in enumerate(match.get("children", []), 1):
        sn = child.get("student_number", "?")
        print(f"\n  Child {i}: {child.get('child_name', '?')} ({sn})")
        print(f"    Class: {child.get('current_class', '?')} - {child.get('current_section', '?')}")
        
        # Check student_progress for raw credentials
        prog_doc = db.collection("student_progress").document(sn).get()
        if prog_doc.exists:
            prog = prog_doc.to_dict()
            raw_family = prog.get("raw_family", {})
            raw_student = prog.get("raw_student", {})
            
            print(f"    [Eduflag] Username: {raw_family.get('Family_UserName', 'N/A')}")
            print(f"    [Eduflag] Password: {raw_family.get('Family_Password', 'N/A')}")
            print(f"    [Online Books] Username: {raw_student.get('UserName', 'N/A')}")
            print(f"    [Online Books] Password: {raw_student.get('Password', 'N/A')}")
            
            # Financials
            financials = prog.get("financials", {})
            year = child.get("current_year", "25-26")
            year_fin = financials.get(year, {})
            if year_fin:
                print(f"    [Fees {year}] Charged: {year_fin.get('total_charged', 0)}, Paid: {year_fin.get('total_paid', 0)}, Balance: {year_fin.get('balance', 0)}")
            else:
                print(f"    [Fees] No financial data for {year}")
        else:
            print(f"    ⚠️ No student_progress doc found")

if __name__ == "__main__":
    main()

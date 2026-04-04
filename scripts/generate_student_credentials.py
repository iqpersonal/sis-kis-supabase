"""
generate_student_credentials.py

Reads the `families` collection in Firestore and creates credentials for each
child so students can log in to the Student Portal.

Credential format:
  - username:  student_number  (e.g. "0021-0006101")
  - password:  first 3 letters of first name (lowercase) + last 4 digits of student_number
               e.g. "naw6101"

Each doc is stored in  student_credentials/{student_number}

Run:  python scripts/generate_student_credentials.py

Optional flags:
  --dry-run     Print what would be written without writing
  --overwrite   Overwrite existing credentials (default: skip existing)
"""

import sys, os, argparse, json

# ── Firebase Admin ────────────────────────────────────────────────
import firebase_admin
from firebase_admin import credentials, firestore
import bcrypt as _bcrypt


def hash_pw(plain: str) -> str:
    """Hash a password with bcrypt."""
    return _bcrypt.hashpw(plain.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")

SA_PATH = os.path.join(os.path.dirname(__file__), "..", "dashboard", "serviceAccountKey.json")

if not firebase_admin._apps:
    cred = credentials.Certificate(SA_PATH)
    firebase_admin.initialize_app(cred)

db = firestore.client()

# ── Also pull current registration data for class/section info ─────
def get_current_registrations():
    """Build a map: student_number → { Class_Code, Section_Code, Academic_Year, ... }"""
    print("  Fetching current registrations...")
    reg_map = {}
    # Get the latest year registrations
    docs = list(db.collection("registrations").where("Academic_Year", "==", "25-26").stream())
    for doc in docs:
        d = doc.to_dict()
        sn = d.get("Student_Number", "")
        if sn:
            reg_map[sn] = d
    print(f"  Found {len(reg_map)} registrations for 25-26")
    return reg_map

# ── Class code → class name mapping ───────────────────────────────
CLASS_MAP = {
    "10": "KG 1", "11": "KG 2", "12": "KG 3",
    "21": "Grade 1", "22": "Grade 2", "23": "Grade 3",
    "24": "Grade 4", "25": "Grade 5", "26": "Grade 6",
    "27": "Grade 7", "28": "Grade 8", "29": "Grade 9",
    "30": "Grade 10", "31": "Grade 11", "32": "Grade 12", "33": "Grade 12+",
}


def generate_password(child_name: str, student_number: str) -> str:
    """Generate a simple password from first name + last 4 digits."""
    first_name = child_name.split()[0] if child_name else "stu"
    # First 3 letters of first name (latin only, lowercase)
    prefix = ""
    for ch in first_name.lower():
        if ch.isalpha() and ord(ch) < 128:
            prefix += ch
        if len(prefix) == 3:
            break
    if not prefix:
        prefix = "stu"
    suffix = student_number[-4:] if len(student_number) >= 4 else student_number
    return prefix + suffix


def main():
    parser = argparse.ArgumentParser(description="Generate student login credentials")
    parser.add_argument("--dry-run", action="store_true", help="Print without writing")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing credentials")
    args = parser.parse_args()

    print("=== Student Credential Generator ===\n")

    # Fetch registrations for current year class/section info
    reg_map = get_current_registrations()

    # Fetch all families
    print("  Fetching families...")
    families = list(db.collection("families").stream())
    print(f"  Found {len(families)} families")

    # Pre-load existing credentials to avoid per-doc reads
    existing_creds = set()
    if not args.overwrite:
        print("  Checking existing credentials...")
        existing_snap = db.collection("student_credentials").select([]).stream()
        for doc in existing_snap:
            existing_creds.add(doc.id)
        print(f"  Found {len(existing_creds)} existing credentials")

    total = 0
    created = 0
    skipped = 0
    batch = db.batch()
    batch_count = 0

    for fam_doc in families:
        fam = fam_doc.to_dict()
        children = fam.get("children", [])
        family_number = fam.get("family_number", "")

        for child in children:
            sn = child.get("student_number", "")
            if not sn:
                continue

            total += 1

            # Check if credential already exists
            if not args.overwrite and sn in existing_creds:
                skipped += 1
                continue

            child_name = child.get("child_name", "Student")
            gender = child.get("gender", "")

            # Get current class/section from registrations
            reg = reg_map.get(sn, {})
            class_code = reg.get("Class_Code", "")
            section_code = reg.get("Section_Code", "")
            academic_year = reg.get("Academic_Year", child.get("current_year", "25-26"))
            school = reg.get("Major_Code", "")

            # Resolve class name
            class_name = CLASS_MAP.get(str(class_code), child.get("current_class", ""))
            section_name = child.get("current_section", "")

            # Look up section name from sections collection if we have section_code
            # (skip for now — use child.current_section as fallback)

            password = generate_password(child_name, sn)

            cred_doc = {
                "student_number": sn,
                "student_name": child_name,
                "gender": gender,
                "class_name": class_name,
                "class_code": str(class_code),
                "section_name": section_name,
                "section_code": str(section_code),
                "school": school,
                "family_number": family_number,
                "academic_year": academic_year,
                "password": hash_pw(password),
                "created_at": firestore.SERVER_TIMESTAMP,
            }

            if args.dry_run:
                if created < 10:
                    print(f"  [DRY] {sn}: {child_name} -> pw={password}  class={class_name}")
            else:
                ref = db.collection("student_credentials").document(sn)
                batch.set(ref, cred_doc)
                batch_count += 1

                if batch_count >= 400:
                    batch.commit()
                    batch = db.batch()
                    batch_count = 0

            created += 1

    # Commit remaining batch
    if batch_count > 0 and not args.dry_run:
        batch.commit()

    print(f"\n=== Done ===")
    print(f"  Total children:  {total}")
    print(f"  Created:         {created}")
    print(f"  Skipped:         {skipped}")

    if args.dry_run:
        print("\n  (dry run — nothing written)")
    else:
        print(f"\n  Credentials written to Firestore: student_credentials/")
        print(f"  Students can now log in at /student/login")


if __name__ == "__main__":
    main()

"""
migrate_hash_passwords.py

One-time migration: hash all plaintext passwords in Firestore.
Targets:
  - families/{id}.password
  - raw_Student/{id}.Password
  - admin_users/{id}.password  (teachers)
  - student_credentials/{id}.password

Skips values that are already bcrypt hashes ($2a$, $2b$, $2y$).

Usage:
    python scripts/migrate_hash_passwords.py --dry-run   # preview
    python scripts/migrate_hash_passwords.py              # execute
"""

import os
import sys
import re
import argparse

try:
    import bcrypt as _bcrypt
except ImportError:
    sys.exit("bcrypt required: pip install bcrypt")

import firebase_admin
from firebase_admin import credentials, firestore

SA_PATH = os.path.join(os.path.dirname(__file__), "..", "dashboard", "serviceAccountKey.json")
if not firebase_admin._apps:
    cred = credentials.Certificate(SA_PATH)
    firebase_admin.initialize_app(cred)

db = firestore.client()

BCRYPT_RE = re.compile(r"^\$2[aby]?\$")


def is_hashed(val: str) -> bool:
    return bool(BCRYPT_RE.match(val))


def hash_pw(plain: str) -> str:
    return _bcrypt.hashpw(plain.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")


def migrate_collection(collection_name: str, field: str, dry_run: bool):
    """Hash all plaintext password fields in a collection (paginated)."""
    print(f"\n── {collection_name}.{field} ──")

    total = 0
    hashed = 0
    already = 0
    empty = 0

    batch = db.batch()
    batch_count = 0
    PAGE_SIZE = 500

    query = db.collection(collection_name).limit(PAGE_SIZE)
    last_doc = None

    while True:
        if last_doc:
            page_query = query.start_after(last_doc)
        else:
            page_query = query

        docs = list(page_query.stream())
        if not docs:
            break

        last_doc = docs[-1]

        for doc in docs:
            total += 1
            data = doc.to_dict()
            pw = data.get(field)

            if not pw or not str(pw).strip():
                empty += 1
                continue

            pw_str = str(pw).strip()

            if is_hashed(pw_str):
                already += 1
                continue

            # Needs hashing
            new_hash = hash_pw(pw_str)
            hashed += 1

            if not dry_run:
                batch.update(doc.reference, {field: new_hash})
                batch_count += 1

                if batch_count >= 400:
                    batch.commit()
                    batch = db.batch()
                    batch_count = 0

        if total % 1000 == 0:
            print(f"    ...processed {total}")

        if len(docs) < PAGE_SIZE:
            break

    if batch_count > 0 and not dry_run:
        batch.commit()

    action = "would hash" if dry_run else "hashed"
    print(f"  Total:   {total}")
    print(f"  {action.capitalize()}: {hashed}")
    print(f"  Already: {already}")
    print(f"  Empty:   {empty}")
    return hashed


def main():
    parser = argparse.ArgumentParser(description="Migrate plaintext passwords to bcrypt")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    args = parser.parse_args()

    if args.dry_run:
        print("=== DRY RUN — no changes will be made ===\n")
    else:
        print("=== MIGRATING PASSWORDS TO BCRYPT ===\n")

    total_hashed = 0
    total_hashed += migrate_collection("families", "password", args.dry_run)
    total_hashed += migrate_collection("raw_Student", "Password", args.dry_run)
    total_hashed += migrate_collection("admin_users", "password", args.dry_run)
    total_hashed += migrate_collection("student_credentials", "password", args.dry_run)

    print(f"\n{'Would hash' if args.dry_run else 'Hashed'} {total_hashed} passwords total.")
    if args.dry_run:
        print("Run without --dry-run to apply changes.")


if __name__ == "__main__":
    main()

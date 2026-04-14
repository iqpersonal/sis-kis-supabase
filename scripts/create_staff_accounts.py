"""
create_staff_accounts.py
────────────────────────
Creates Firebase Auth accounts for all active staff members in the
Firestore `staff` collection who don't already have an account.

Each staff member gets:
- Email: their E_Mail field from staff doc
- Password: their Staff_Number (temporary — they should change it)

Usage:
  python create_staff_accounts.py [--dry-run]
"""

import os
import sys

try:
    import firebase_admin
    from firebase_admin import credentials, firestore, auth
except ImportError:
    sys.exit("firebase-admin is required. Install with: pip install firebase-admin")

# ── Config ────────────────────────────────────────────────────────────────

BATCH_SIZE = 50  # process in smaller batches to avoid rate limits

def init_firebase():
    search_paths = [
        os.path.join(os.path.dirname(__file__), "serviceAccountKey.json"),
        os.path.join(os.path.dirname(__file__), "..", "dashboard", "serviceAccountKey.json"),
    ]
    cred_path = None
    for p in search_paths:
        if os.path.isfile(p):
            cred_path = os.path.abspath(p)
            break
    if not cred_path:
        sys.exit("serviceAccountKey.json not found in scripts/ or dashboard/")
    print(f"Firebase credentials: {cred_path}")
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(cred_path))
    return firestore.client()


def get_existing_emails():
    """Get all existing Firebase Auth emails to avoid duplicates."""
    existing = set()
    page = auth.list_users()
    while page:
        for user in page.users:
            if user.email:
                existing.add(user.email.lower())
        page = page.get_next_page()
    return existing


def main():
    dry_run = "--dry-run" in sys.argv
    if dry_run:
        print("=== DRY RUN MODE — no accounts will be created ===\n")

    db = init_firebase()

    # Fetch all active staff with email
    print("Fetching staff collection...")
    staff_ref = db.collection("staff")
    docs = staff_ref.stream()

    staff_list = []
    for doc in docs:
        data = doc.to_dict()
        email = (data.get("E_Mail") or "").strip().lower()
        staff_number = data.get("Staff_Number") or doc.id
        status = data.get("Status", "")
        name = data.get("E_Full_Name") or data.get("A_Full_Name") or ""

        # Skip if no email or terminated
        if not email or "@" not in email:
            continue
        if str(status).lower() in ("terminated", "inactive", "0"):
            continue

        staff_list.append({
            "email": email,
            "staff_number": str(staff_number).strip(),
            "name": name,
        })

    print(f"Found {len(staff_list)} active staff with email addresses")

    # Get existing accounts
    print("Checking existing Firebase Auth accounts...")
    existing_emails = get_existing_emails()
    print(f"Found {len(existing_emails)} existing accounts")

    # Filter to only new accounts
    to_create = [s for s in staff_list if s["email"] not in existing_emails]
    already_exist = len(staff_list) - len(to_create)
    print(f"  Already have accounts: {already_exist}")
    print(f"  Need to create: {len(to_create)}")

    if not to_create:
        print("\nNo new accounts to create. Done!")
        return

    if dry_run:
        print("\nAccounts that would be created:")
        for s in to_create[:20]:
            print(f"  {s['email']} (Staff# {s['staff_number']}) — {s['name']}")
        if len(to_create) > 20:
            print(f"  ... and {len(to_create) - 20} more")
        return

    # Confirm
    confirm = input(f"\nCreate {len(to_create)} accounts? (yes/no): ").strip().lower()
    if confirm != "yes":
        print("Aborted.")
        return

    # Create accounts in batches
    created = 0
    failed = 0
    errors = []

    for i in range(0, len(to_create), BATCH_SIZE):
        batch = to_create[i : i + BATCH_SIZE]
        for s in batch:
            try:
                auth.create_user(
                    email=s["email"],
                    password=s["staff_number"],
                    display_name=s["name"],
                    disabled=False,
                )
                created += 1
            except Exception as e:
                failed += 1
                errors.append(f"  {s['email']}: {e}")

        print(f"  Progress: {min(i + BATCH_SIZE, len(to_create))}/{len(to_create)}")

    print(f"\nDone! Created: {created}, Failed: {failed}")
    if errors:
        print("\nErrors:")
        for err in errors[:20]:
            print(err)
        if len(errors) > 20:
            print(f"  ... and {len(errors) - 20} more errors")

if __name__ == "__main__":
    main()

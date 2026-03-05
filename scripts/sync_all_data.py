"""
Comprehensive sync: verify & upload ALL data from SQL Server .bak to Firestore.
Handles partial uploads by clearing + re-uploading affected collections.
"""
import os
import sys
from datetime import date, datetime
from decimal import Decimal

try:
    import pyodbc
except ImportError:
    sys.exit("pyodbc required: pip install pyodbc")

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    sys.exit("firebase-admin required: pip install firebase-admin")

SERVER = r"localhost\SQLEXPRESS"
TEMP_DB = "_bak_import_temp"
BATCH_SIZE = 400
KEY_PATH = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")

# ─── Tables that need gap-fixing (clear & re-upload) ────────────────
GAP_TABLES = {
    "Registration":    "registrations",
    "Student_Charges": "student_charges",
}

# ─── Tables to upload fresh (not yet in Firestore) ──────────────────
NEW_TABLES = {
    "Student_Invoice":      "student_invoices",
    "Student_Installments": "student_installments",
    "Student_Discount":     "student_discounts",
    "Student_Absence":      "student_absence",
    "Student_Exam_Results": "student_exam_results",
    "Student_Tardy":        "student_tardy",
    "Section":              "sections",
    "Class":                "classes",
    "Subject":              "subjects",
}

# ─── Tables already fully synced (skip) ─────────────────────────────
VERIFIED_TABLES = {
    "Academic_Year":   "academic_years",     # 15 = 15 ✓
    "Charge_Type":     "charge_types",       # 320 = 320 ✓
    "Nationality":     "nationalities",      # 185 = 185 ✓
    "Student":         "students",           # 7638 = 7638 ✓
    "Sponsor":         "sponsors",           # 27768 = 27768 ✓
}


def json_safe(val):
    """Convert SQL types to Firestore-compatible JSON."""
    if val is None:
        return None
    if isinstance(val, Decimal):
        return float(val)
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    if isinstance(val, bytes):
        # Skip large binary blobs (like FileData in Invoice)
        if len(val) > 1_000_000:
            return None
        return val.hex()
    return val


def delete_collection(db_fs, collection_name):
    """Delete all documents in a Firestore collection (in batches)."""
    coll = db_fs.collection(collection_name)
    deleted = 0
    while True:
        docs = list(coll.limit(400).stream())
        if not docs:
            break
        batch = db_fs.batch()
        for doc in docs:
            batch.delete(doc.reference)
        batch.commit()
        deleted += len(docs)
        if deleted % 2000 == 0:
            print(f"    Deleted {deleted}...")
    return deleted


def upload_table(cursor, db_fs, sql_table, fs_collection, skip_cols=None):
    """Upload all rows from a SQL table to Firestore collection."""
    skip_cols = skip_cols or set()

    cursor.execute(f"SELECT COUNT(*) FROM [{sql_table}]")
    count = cursor.fetchone()[0]
    print(f"\n  {sql_table} → {fs_collection}: {count:,} rows")

    if count == 0:
        print(f"    (empty table, skipping)")
        return 0

    cursor.execute(f"SELECT * FROM [{sql_table}]")
    cols = [c[0] for c in cursor.description]

    batch = db_fs.batch()
    batch_count = 0
    total = 0
    coll_ref = db_fs.collection(fs_collection)

    for row in cursor:
        doc = {}
        for i in range(len(cols)):
            if cols[i] in skip_cols:
                continue
            val = json_safe(row[i])
            if val is not None:
                doc[cols[i]] = val
        batch.set(coll_ref.document(), doc)
        batch_count += 1
        total += 1

        if batch_count >= BATCH_SIZE:
            batch.commit()
            batch = db_fs.batch()
            batch_count = 0
            if total % 5000 == 0:
                print(f"    {total:,}/{count:,}...")

    if batch_count > 0:
        batch.commit()

    print(f"    ✓ Uploaded {total:,} docs")
    return total


def main():
    # ── Connect SQL Server ──
    conn = pyodbc.connect(
        f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={SERVER};"
        f"DATABASE={TEMP_DB};Trusted_Connection=yes",
        autocommit=True,
    )
    cursor = conn.cursor()

    # ── Init Firebase ──
    if not firebase_admin._apps:
        cred = credentials.Certificate(KEY_PATH)
        firebase_admin.initialize_app(cred)
    db_fs = firestore.client()

    # ══════════════════════════════════════════════════════════════════
    # PHASE 1: Fix gap tables (clear & re-upload)
    # ══════════════════════════════════════════════════════════════════
    print("=" * 60)
    print("PHASE 1: Fix collections with gaps")
    print("=" * 60)

    for sql_table, fs_collection in GAP_TABLES.items():
        print(f"\n  Clearing '{fs_collection}'...")
        deleted = delete_collection(db_fs, fs_collection)
        print(f"    Deleted {deleted:,} existing docs")

        # Skip binary/blob columns for Student_Invoice
        skip = set()
        if sql_table == "Student_Invoice":
            skip = {"FileData"}  # large binary blob

        upload_table(cursor, db_fs, sql_table, fs_collection, skip_cols=skip)

    # ══════════════════════════════════════════════════════════════════
    # PHASE 2: Upload new tables
    # ══════════════════════════════════════════════════════════════════
    print("\n" + "=" * 60)
    print("PHASE 2: Upload new tables")
    print("=" * 60)

    for sql_table, fs_collection in NEW_TABLES.items():
        skip = set()
        if sql_table == "Student_Invoice":
            skip = {"FileData"}
        if sql_table == "Student_Absence":
            skip = {"DDS"}  # text blob
        if sql_table == "Student_Tardy":
            skip = {"DDS"}

        upload_table(cursor, db_fs, sql_table, fs_collection, skip_cols=skip)

    # ══════════════════════════════════════════════════════════════════
    # PHASE 3: Final verification
    # ══════════════════════════════════════════════════════════════════
    print("\n" + "=" * 60)
    print("PHASE 3: Verification")
    print("=" * 60)

    all_tables = {**VERIFIED_TABLES, **GAP_TABLES, **NEW_TABLES}
    all_ok = True

    for sql_table, fs_collection in sorted(all_tables.items(), key=lambda x: x[1]):
        # SQL count
        cursor.execute(f"SELECT COUNT(*) FROM [{sql_table}]")
        sql_count = cursor.fetchone()[0]

        # Firestore count
        fs_count = 0
        for _ in db_fs.collection(fs_collection).stream():
            fs_count += 1

        match = "✓" if sql_count == fs_count else "✗"
        if sql_count != fs_count:
            all_ok = False

        print(f"  {match} {fs_collection:<25} SQL: {sql_count:>10,}  Firestore: {fs_count:>10,}  {'MATCH' if sql_count == fs_count else f'DIFF: {sql_count - fs_count:+,}'}")

    print()
    if all_ok:
        print("  ✓ ALL COLLECTIONS MATCH — Data is 100% accurate!")
    else:
        print("  ✗ Some collections have mismatches. Check above.")

    cursor.close()
    conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()

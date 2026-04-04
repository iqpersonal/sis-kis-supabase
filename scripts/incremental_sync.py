"""
incremental_sync.py
───────────────────
Incrementally sync SQL Server .bak data → Firestore.

Strategy:
  - For tables WITH Academic_Year: only re-sync years where counts differ
  - For tables WITHOUT Academic_Year: compare total counts, re-upload if different
  - The `students` collection uses a special enrichment join

Usage:
  python incremental_sync.py                           # sync from existing DB
  python incremental_sync.py --bak "C:\\path\\to\\file.bak"  # restore then sync

Output: JSON summary printed to stdout (for API integration)
"""
import argparse
import json
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

# ┌──────────────────────────────────────────────────────────────────┐
# │ Table definitions                                               │
# │   sql_table  → Firestore collection name                       │
# │   has_year   → whether it has Academic_Year column              │
# │   skip_cols  → columns to skip (blobs, etc.)                   │
# └──────────────────────────────────────────────────────────────────┘

YEAR_TABLES = {
    "Registration":        {"fs": "registrations",        "skip": set()},
    "Student_Charges":     {"fs": "student_charges",      "skip": set()},
    "Student_Invoice":     {"fs": "student_invoices",     "skip": {"FileData"}},
    "Student_Installments":{"fs": "student_installments", "skip": set()},
    "Student_Discount":    {"fs": "student_discounts",    "skip": set()},
    "Student_Absence":     {"fs": "student_absence",      "skip": {"DDS"}},
    "Student_Exam_Results":{"fs": "student_exam_results", "skip": set()},
    "Student_Tardy":       {"fs": "student_tardy",        "skip": {"DDS"}},
    "Section":             {"fs": "sections",             "skip": {"DDS"}},
    "Class_Subjects":      {"fs": "class_subjects",       "skip": set()},
    "Sponsor":             {"fs": "sponsors",             "skip": set()},
    "Grades":              {"fs": "grades",               "skip": set()},
    "Student_Previous_School": {"fs": "student_previous_schools", "skip": {"DDS"}},
    "Charge_Type":         {"fs": "charge_types",         "skip": set()},
}

NO_YEAR_TABLES = {
    "Academic_Year":  {"fs": "academic_years",  "skip": set()},
    "Nationality":    {"fs": "nationalities",   "skip": set()},
    "Class":          {"fs": "classes",         "skip": set()},
    "Subject":        {"fs": "subjects",        "skip": set()},
    "Family":         {"fs": "families_raw",    "skip": {"DDS"}},
    "Family_Children":{"fs": "family_children",  "skip": {"DDS"}},
}

# Students use a special join — handled separately
STUDENTS_FS = "students"


# ─── Helpers ─────────────────────────────────────────────────────────

def emit_progress(current, total, message, phase="sync", table=""):
    """Emit a progress event line to stderr for the API to stream."""
    pct = round(current / total * 100) if total else 0
    obj = {"type": "progress", "current": current, "total": total, "pct": pct,
           "phase": phase, "table": table, "message": message}
    print(f"PROGRESS:{json.dumps(obj)}", file=sys.stderr, flush=True)


def json_safe(val):
    if val is None:
        return None
    if isinstance(val, Decimal):
        return float(val)
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    if isinstance(val, bytes):
        if len(val) > 500_000:
            return None
        return val.hex()
    return val


def delete_collection_docs(db_fs, collection_name, year=None):
    """Delete docs from Firestore, optionally filtered by Academic_Year."""
    coll = db_fs.collection(collection_name)
    deleted = 0
    while True:
        if year is not None:
            q = coll.where("Academic_Year", "==", year).limit(400)
        else:
            q = coll.limit(400)
        docs = list(q.stream())
        if not docs:
            break
        batch = db_fs.batch()
        for doc in docs:
            batch.delete(doc.reference)
        batch.commit()
        deleted += len(docs)
    return deleted


def upload_rows(cursor, db_fs, sql, fs_collection, skip_cols):
    """Execute SQL query and upload results to Firestore."""
    cursor.execute(sql)
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

    if batch_count > 0:
        batch.commit()

    return total


def get_fs_count(db_fs, collection_name):
    """Count all docs in a Firestore collection."""
    count = 0
    for _ in db_fs.collection(collection_name).stream():
        count += 1
    return count


def get_fs_year_counts(db_fs, collection_name):
    """Get per-year counts for a Firestore collection."""
    counts = {}
    for doc in db_fs.collection(collection_name).stream():
        d = doc.to_dict()
        y = str(d.get("Academic_Year", d.get("Academic_year", "")))
        counts[y] = counts.get(y, 0) + 1
    return counts


def get_sql_year_counts(cursor, sql_table):
    """Get per-year counts from SQL Server."""
    # Handle different column name casing
    year_col = "Academic_Year"
    cursor.execute(f"""
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = '{sql_table}' AND LOWER(COLUMN_NAME) LIKE '%academic%year%'
    """)
    row = cursor.fetchone()
    if row:
        year_col = row[0]

    cursor.execute(f"SELECT [{year_col}], COUNT(*) FROM [{sql_table}] GROUP BY [{year_col}]")
    return {str(r[0]): r[1] for r in cursor.fetchall()}


def restore_bak(cursor, bak_path):
    """Restore .bak, replacing existing temp DB."""
    # Kill existing connections
    cursor.execute(f"SELECT DB_ID('{TEMP_DB}')")
    if cursor.fetchone()[0] is not None:
        try:
            cursor.execute(f"ALTER DATABASE [{TEMP_DB}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE")
            cursor.execute(f"DROP DATABASE [{TEMP_DB}]")
        except:
            pass

    cursor.execute(f"RESTORE FILELISTONLY FROM DISK = N'{bak_path}'")
    files = cursor.fetchall()

    cursor.execute("SELECT SERVERPROPERTY('InstanceDefaultDataPath')")
    data_path = cursor.fetchone()[0]

    moves = []
    for i, f in enumerate(files):
        lname = f[0]
        ext = os.path.splitext(f[2])[1]
        moves.append(f"MOVE N'{lname}' TO N'{data_path}{TEMP_DB}_{i}{ext}'")

    sql = f"RESTORE DATABASE [{TEMP_DB}] FROM DISK = N'{bak_path}' WITH {', '.join(moves)}, REPLACE"
    print(f"Restoring {bak_path} → [{TEMP_DB}]...", file=sys.stderr)
    cursor.execute(sql)
    while cursor.nextset():
        pass
    print("Restore complete.", file=sys.stderr)


def sync_students(cursor, db_fs):
    """Sync students with the enrichment join (Student + Family_Children + Family)."""
    sql_count_q = "SELECT COUNT(*) FROM [Student]"
    cursor.execute(sql_count_q)
    sql_count = cursor.fetchone()[0]
    fs_count = get_fs_count(db_fs, STUDENTS_FS)

    if sql_count == fs_count:
        return {"collection": STUDENTS_FS, "action": "skip", "sql": sql_count, "firestore": fs_count, "synced": 0}

    # Different count — clear & re-upload with enrichment join
    print(f"  students: SQL={sql_count:,} FS={fs_count:,} → re-syncing with join", file=sys.stderr)
    deleted = delete_collection_docs(db_fs, STUDENTS_FS)

    join_sql = """
        SELECT
            s.*,
            fc.E_Child_Name, fc.A_Child_Name,
            fc.Child_Birth_Date, fc.Gender,
            fc.Nationality_Code_Primary,
            fc.Enrollment_Date, fc.Email, fc.Barcode,
            COALESCE(fc.E_Child_Name, '') + ' ' +
              COALESCE(f.E_Father_Name, '') + ' ' +
              COALESCE(f.E_Family_Name, '') AS E_Full_Name,
            COALESCE(fc.A_Child_Name, '') + ' ' +
              COALESCE(f.A_Father_Name, '') + ' ' +
              COALESCE(f.A_Family_Name, '') AS A_Full_Name,
            f.E_Father_Name, f.A_Father_Name,
            f.E_Family_Name, f.A_Family_Name
        FROM Student s
        LEFT JOIN Family_Children fc
            ON s.Family_Number = fc.Family_Number
           AND s.Family_Sub    = fc.Family_Sub
           AND s.Child_Number  = fc.Child_Number
        LEFT JOIN Family f
            ON s.Family_Number = f.Family_Number
           AND s.Family_Sub    = f.Sub
    """
    uploaded = upload_rows(cursor, db_fs, join_sql, STUDENTS_FS, set())
    return {"collection": STUDENTS_FS, "action": "re-upload", "sql": sql_count, "firestore": uploaded, "deleted": deleted, "synced": uploaded}


def main():
    parser = argparse.ArgumentParser(description="Incremental sync SQL Server → Firestore")
    parser.add_argument("--bak", help="Path to .bak file (restores before sync)")
    parser.add_argument("--server", default=SERVER, help="SQL Server instance")
    args = parser.parse_args()

    # ── Connect ──
    conn = pyodbc.connect(
        f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={args.server};Trusted_Connection=yes",
        autocommit=True,
    )
    cursor = conn.cursor()

    # Total tables for progress tracking
    TOTAL_STEPS = len(YEAR_TABLES) + len(NO_YEAR_TABLES) + 1  # +1 for students
    step = 0

    # ── Restore .bak if provided ──
    if args.bak:
        emit_progress(0, TOTAL_STEPS, "Restoring .bak file...", phase="restore")
        restore_bak(cursor, os.path.abspath(args.bak))
        emit_progress(0, TOTAL_STEPS, "Restore complete", phase="restore")

    cursor.execute(f"USE [{TEMP_DB}]")

    # ── Init Firebase ──
    if not firebase_admin._apps:
        cred = credentials.Certificate(KEY_PATH)
        firebase_admin.initialize_app(cred)
    db_fs = firestore.client()

    results = []
    total_synced = 0

    # ══════════════════════════════════════════════════════════════
    # 1) Tables WITH Academic_Year → sync only changed years
    # ══════════════════════════════════════════════════════════════
    print("Phase 1: Year-based tables (incremental by year)", file=sys.stderr)
    for sql_table, cfg in YEAR_TABLES.items():
        fs_col = cfg["fs"]
        skip = cfg["skip"]

        step += 1
        emit_progress(step, TOTAL_STEPS, f"Checking {fs_col}...", table=fs_col)

        try:
            sql_counts = get_sql_year_counts(cursor, sql_table)
        except Exception as e:
            results.append({"collection": fs_col, "action": "error", "error": str(e)})
            emit_progress(step, TOTAL_STEPS, f"{fs_col}: error", table=fs_col)
            continue

        fs_counts = get_fs_year_counts(db_fs, fs_col)

        # Find years that differ
        all_years = set(sql_counts.keys()) | set(fs_counts.keys())
        changed_years = []
        for y in all_years:
            sc = sql_counts.get(y, 0)
            fc = fs_counts.get(y, 0)
            if sc != fc:
                changed_years.append(y)

        if not changed_years:
            sql_total = sum(sql_counts.values())
            fs_total = sum(fs_counts.values())
            results.append({"collection": fs_col, "action": "skip", "sql": sql_total, "firestore": fs_total, "synced": 0})
            print(f"  {fs_col}: ✓ all years match ({sql_total:,})", file=sys.stderr)
            emit_progress(step, TOTAL_STEPS, f"{fs_col}: unchanged ✓", table=fs_col)
            continue

        synced_for_table = 0
        for y in changed_years:
            sc = sql_counts.get(y, 0)
            fc = fs_counts.get(y, 0)
            print(f"  {fs_col} [{y}]: SQL={sc:,} FS={fc:,} → re-syncing", file=sys.stderr)

            # Delete existing docs for this year
            del_count = delete_collection_docs(db_fs, fs_col, year=y)

            # Find the actual column name for Academic_Year
            cursor.execute(f"""
                SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_NAME = '{sql_table}' AND LOWER(COLUMN_NAME) LIKE '%academic%year%'
            """)
            year_col = cursor.fetchone()[0]

            # Upload from SQL for this year
            if sc > 0:
                skip_clause = ""
                col_list = "*"
                upload_sql = f"SELECT * FROM [{sql_table}] WHERE [{year_col}] = '{y}'"
                uploaded = upload_rows(cursor, db_fs, upload_sql, fs_col, skip)
                synced_for_table += uploaded

            # If year was removed from SQL (sc=0), we just deleted the FS docs

        sql_total = sum(sql_counts.values())
        results.append({
            "collection": fs_col,
            "action": "partial-sync",
            "sql": sql_total,
            "years_synced": changed_years,
            "synced": synced_for_table,
        })
        total_synced += synced_for_table
        emit_progress(step, TOTAL_STEPS, f"{fs_col}: synced {synced_for_table:,} docs", table=fs_col)

    # ══════════════════════════════════════════════════════════════
    # 2) Tables WITHOUT Academic_Year → full re-upload if different
    # ══════════════════════════════════════════════════════════════
    print("\nPhase 2: Non-year tables", file=sys.stderr)
    for sql_table, cfg in NO_YEAR_TABLES.items():
        fs_col = cfg["fs"]
        skip = cfg["skip"]
        step += 1
        emit_progress(step, TOTAL_STEPS, f"Checking {fs_col}...", table=fs_col)

        cursor.execute(f"SELECT COUNT(*) FROM [{sql_table}]")
        sql_count = cursor.fetchone()[0]
        fs_count = get_fs_count(db_fs, fs_col)

        if sql_count == fs_count:
            results.append({"collection": fs_col, "action": "skip", "sql": sql_count, "firestore": fs_count, "synced": 0})
            print(f"  {fs_col}: ✓ match ({sql_count:,})", file=sys.stderr)
            emit_progress(step, TOTAL_STEPS, f"{fs_col}: unchanged ✓", table=fs_col)
            continue

        print(f"  {fs_col}: SQL={sql_count:,} FS={fs_count:,} → re-uploading", file=sys.stderr)
        emit_progress(step, TOTAL_STEPS, f"Uploading {fs_col} ({sql_count:,} docs)...", table=fs_col)
        deleted = delete_collection_docs(db_fs, fs_col)
        uploaded = upload_rows(cursor, db_fs, f"SELECT * FROM [{sql_table}]", fs_col, skip)
        results.append({
            "collection": fs_col,
            "action": "re-upload",
            "sql": sql_count,
            "deleted": deleted,
            "synced": uploaded,
        })
        total_synced += uploaded
        emit_progress(step, TOTAL_STEPS, f"{fs_col}: synced {uploaded:,} docs", table=fs_col)

    # ══════════════════════════════════════════════════════════════
    # 3) Students (special join)
    # ══════════════════════════════════════════════════════════════
    print("\nPhase 3: Students (enrichment join)", file=sys.stderr)
    step += 1
    emit_progress(step, TOTAL_STEPS, "Syncing students...", table="students")
    student_result = sync_students(cursor, db_fs)
    results.append(student_result)
    total_synced += student_result.get("synced", 0)
    action = student_result.get("action", "")
    emit_progress(step, TOTAL_STEPS, f"students: {action} ({student_result.get('synced', 0):,} docs)", table="students")

    # ── Summary ──
    cursor.close()
    conn.close()

    summary = {
        "success": True,
        "total_synced": total_synced,
        "collections": results,
    }

    # Print JSON summary to stdout (for API consumption)
    print(json.dumps(summary, indent=2))

    # Print human-readable summary to stderr
    print(f"\n{'='*60}", file=sys.stderr)
    print(f"Sync complete. {total_synced:,} documents synced.", file=sys.stderr)
    skipped = sum(1 for r in results if r["action"] == "skip")
    synced = sum(1 for r in results if r["action"] != "skip")
    print(f"  {skipped} collections unchanged (skipped)", file=sys.stderr)
    print(f"  {synced} collections synced", file=sys.stderr)
    print(f"{'='*60}", file=sys.stderr)


if __name__ == "__main__":
    main()

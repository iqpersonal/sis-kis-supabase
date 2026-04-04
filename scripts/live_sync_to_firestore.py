"""
live_sync_to_firestore.py
─────────────────────────
Direct SQL Server → Firestore sync (no .bak restore needed).
Uses db_config.py to connect to 172.16.1.160\\SQL2016 with sis_reader.

Usage:
  python live_sync_to_firestore.py                       # quick sync (current year only)
  python live_sync_to_firestore.py --mode full            # full sync (all years, all tables)
  python live_sync_to_firestore.py --mode quick --dry-run # preview what quick sync would do
  python live_sync_to_firestore.py --table students       # sync one table only
  python live_sync_to_firestore.py --preset booksale --year 25-26  # book-sale tables only

Modes:
  quick  — Current academic year for all tables, + previous year for fees.
           Static (non-year) tables still use count-based skip. (default)
  full   — All years for all tables (original behavior, for first-time or recovery).

Logs to: scripts/live_sync.log
"""

import argparse
import json
import logging
import os
import sys
import time
from datetime import date, datetime
from decimal import Decimal

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    sys.exit("firebase-admin required: pip install firebase-admin")

try:
    from google.cloud.firestore_v1.aggregation import AggregationQuery
    HAS_AGGREGATION = True
except ImportError:
    HAS_AGGREGATION = False

from db_config import connect_sql

# ── Logging ──────────────────────────────────────────────────────────────────

LOG_PATH = os.path.join(os.path.dirname(__file__), "live_sync.log")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    handlers=[
        logging.FileHandler(LOG_PATH, encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger("live_sync")

# ── Config ───────────────────────────────────────────────────────────────────

BATCH_SIZE = 400

# ── Table tier definitions for quick mode ────────────────────────────────────
# Tier 1: Current year only — academic data that doesn't change for past years
CURRENT_YEAR_TABLES = {
    "Registration",
    "Student_Exam_Results",
    "Grades",
    "Student_Absence",
    "Student_Tardy",
    "Section",
    "Class_Subjects",
    "Student_Previous_School",
}

# Tier 2: Current + previous year — fees/financial data (late payments possible)
FEES_TABLES = {
    "Student_Charges",
    "Student_Invoice",
    "Student_Installments",
    "Student_Discount",
    "Sponsor",
    "Charge_Type",
}

# Tables WITH Academic_Year column → supports incremental (year-based) sync
YEAR_TABLES = {
    "Registration":            {"fs": "registrations",            "skip": set()},
    "Student_Charges":         {"fs": "student_charges",          "skip": set()},
    "Student_Invoice":         {"fs": "student_invoices",         "skip": {"FileData"}},
    "Student_Installments":    {"fs": "student_installments",     "skip": set()},
    "Student_Discount":        {"fs": "student_discounts",        "skip": set()},
    "Student_Absence":         {"fs": "student_absence",          "skip": {"DDS"}},
    "Student_Exam_Results":    {"fs": "student_exam_results",     "skip": set()},
    "Student_Tardy":           {"fs": "student_tardy",            "skip": {"DDS"}},
    "Section":                 {"fs": "sections",                 "skip": {"DDS"}},
    "Class_Subjects":          {"fs": "class_subjects",           "skip": set()},
    "Sponsor":                 {"fs": "sponsors",                 "skip": set()},
    "Grades":                  {"fs": "grades",                   "skip": set()},
    "Student_Previous_School": {"fs": "student_previous_schools", "skip": {"DDS"}},
    "Charge_Type":             {"fs": "charge_types",             "skip": set()},
    "Registration_Status": {"fs": "registration_status",  "skip": set()},
    "Section_Avg":         {"fs": "section_averages",     "skip": set()},
}

# Tables WITHOUT Academic_Year → full replace sync
NO_YEAR_TABLES = {
    "Academic_Year":       {"fs": "academic_years",       "skip": set()},
    "Nationality":         {"fs": "nationalities",        "skip": set()},
    "Class":               {"fs": "classes",              "skip": set()},
    "Subject":             {"fs": "subjects",             "skip": set()},
    "Family":              {"fs": "families_raw",         "skip": {"DDS"}},
    "Family_Children":     {"fs": "family_children",      "skip": {"DDS"}},
    "Employee":            {"fs": "employees",            "skip": {"DDS"}},
    "Branch":              {"fs": "branches",             "skip": set()},
    "School":              {"fs": "schools",              "skip": set()},
    "Exams":               {"fs": "exams",                "skip": set()},
}

# Students use a special enrichment join
STUDENTS_FS = "students"

# ── Presets ──────────────────────────────────────────────────────────────────
# Named subsets of tables for targeted sync (e.g. book-sale only needs enrollment data)
PRESETS = {
    "booksale": {
        "students": True,                            # enriched student join
        "year_tables":    {"Registration"},           # SQL table names
        "no_year_tables": {"Family", "Family_Children"},
    },
}

STUDENT_SQL = """
SELECT
  s.*,
  r.Section_Code, r.Status_Code AS Registration_Status,
  r.Academic_Year AS Reg_Academic_Year,
  r.Major_Code, r.Class_Code
FROM Student s
LEFT JOIN Registration r
  ON s.Student_Number = r.Student_Number
  AND r.Academic_Year = (
      SELECT MAX(r2.Academic_Year)
      FROM Registration r2
      WHERE r2.Student_Number = s.Student_Number
  )
"""

STUDENT_SKIP = {"Photo", "DDS"}


# ── Helpers ──────────────────────────────────────────────────────────────────

def json_safe(val):
    """Convert SQL value to Firestore-safe type."""
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
    if isinstance(val, str):
        return val[:10_000] if len(val) > 10_000 else val
    return val


def init_firebase():
    """Initialize Firebase Admin SDK."""
    if firebase_admin._apps:
        return firestore.client()

    search = [
        os.path.join(os.path.dirname(__file__), "..", "dashboard", "serviceAccountKey.json"),
        os.path.join(os.path.dirname(__file__), "serviceAccountKey.json"),
    ]
    cred_path = next((p for p in search if os.path.isfile(p)), None)
    if not cred_path:
        sys.exit("serviceAccountKey.json not found in dashboard/ or scripts/")

    cred = credentials.Certificate(os.path.abspath(cred_path))
    firebase_admin.initialize_app(cred)
    return firestore.client()


def delete_collection(db_fs, collection_name, year=None):
    """Delete docs from a Firestore collection, optionally by Academic_Year."""
    coll = db_fs.collection(collection_name)
    deleted = 0
    while True:
        if year:
            q = coll.where(filter=firestore.FieldFilter("Academic_Year", "==", year)).limit(400)
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


def upload_cursor(cursor, db_fs, fs_collection, skip_cols):
    """Stream cursor rows -> Firestore in batches. Returns upload count."""
    cols = [c[0] for c in cursor.description]
    coll_ref = db_fs.collection(fs_collection)
    batch = db_fs.batch()
    batch_n = 0
    total = 0

    for row in cursor:
        doc = {}
        for i, col in enumerate(cols):
            if col in skip_cols:
                continue
            val = json_safe(row[i])
            if val is not None:
                doc[col] = val
        batch.set(coll_ref.document(), doc)
        batch_n += 1
        total += 1
        if batch_n >= BATCH_SIZE:
            batch.commit()
            batch = db_fs.batch()
            batch_n = 0

    if batch_n > 0:
        batch.commit()
    return total


def get_sql_count(cursor, table, year=None):
    """Count rows in a SQL table, optionally filtered by year."""
    if year:
        cursor.execute(f"SELECT COUNT(*) FROM [{table}] WHERE Academic_Year = ?", year)
    else:
        cursor.execute(f"SELECT COUNT(*) FROM [{table}]")
    return cursor.fetchone()[0]


def get_fs_count(db_fs, collection, year=None):
    """Count docs in a Firestore collection using fast aggregation COUNT.
    Falls back to doc iteration if aggregation is unavailable."""
    coll = db_fs.collection(collection)
    if year:
        q = coll.where(filter=firestore.FieldFilter("Academic_Year", "==", year))
    else:
        q = coll

    # Fast path: use .count() on Query or CollectionReference
    try:
        count_query = q.count(alias="total")
        results = count_query.get()
        for r in results:
            for agg_result in r:
                return agg_result.value
    except Exception as e:
        log.warning("  Aggregation COUNT failed, falling back to iteration: %s", e)

    # Fallback: iterate docs (slow, O(n))
    count = 0
    for _ in q.stream():
        count += 1
    return count


def get_current_year(cursor):
    """Detect the current academic year from the Registration table."""
    cursor.execute("SELECT MAX(Academic_Year) FROM Registration")
    row = cursor.fetchone()
    return str(row[0]) if row and row[0] else None


def get_previous_year(current_year):
    """Compute the previous academic year string (e.g., '25-26' -> '24-25')."""
    if not current_year or "-" not in current_year:
        return None
    parts = current_year.split("-")
    try:
        a, b = int(parts[0]), int(parts[1])
        return f"{a - 1:02d}-{b - 1:02d}"
    except ValueError:
        return None


def get_years_for_table(sql_table, mode, current_year, prev_year):
    """Return the list of years to check for a year-based table, based on mode."""
    if mode == "full":
        return None  # None means: query all distinct years from SQL (original behavior)

    if sql_table in CURRENT_YEAR_TABLES:
        return [current_year] if current_year else None

    if sql_table in FEES_TABLES:
        years = []
        if current_year:
            years.append(current_year)
        if prev_year:
            years.append(prev_year)
        return years if years else None

    # Unknown table -> treat as current year only
    return [current_year] if current_year else None


# ── Sync functions ───────────────────────────────────────────────────────────

def sync_no_year_table(cursor, db_fs, sql_table, cfg, dry_run=False):
    """Sync a table without Academic_Year (full replace if counts differ)."""
    fs_col = cfg["fs"]
    skip = cfg["skip"]

    sql_count = get_sql_count(cursor, sql_table)
    fs_count = get_fs_count(db_fs, fs_col)

    if sql_count == fs_count:
        log.info("  %s: %d rows -- already in sync, skip", fs_col, sql_count)
        return {"collection": fs_col, "action": "skip", "sql": sql_count, "fs": fs_count}

    log.info("  %s: SQL=%d, FS=%d -> re-upload", fs_col, sql_count, fs_count)
    if dry_run:
        return {"collection": fs_col, "action": "dry-run", "sql": sql_count, "fs": fs_count}

    deleted = delete_collection(db_fs, fs_col)
    cursor.execute(f"SELECT * FROM [{sql_table}]")
    uploaded = upload_cursor(cursor, db_fs, fs_col, skip)
    log.info("  %s: deleted %d, uploaded %d", fs_col, deleted, uploaded)
    return {"collection": fs_col, "action": "replaced", "deleted": deleted, "uploaded": uploaded}


def sync_year_table(cursor, db_fs, sql_table, cfg, dry_run=False, years_filter=None):
    """Sync a table that has Academic_Year.
    years_filter: list of years to check, or None for all distinct years in SQL."""
    fs_col = cfg["fs"]
    skip = cfg["skip"]

    # Determine which years to check
    if years_filter is not None:
        years = years_filter
        log.info("  Checking years: %s", ", ".join(str(y) for y in years))
    else:
        cursor.execute(f"SELECT DISTINCT Academic_Year FROM [{sql_table}] ORDER BY Academic_Year")
        years = [r[0] for r in cursor.fetchall()]

    total_uploaded = 0
    actions = []

    for year in years:
        sql_c = get_sql_count(cursor, sql_table, year)
        fs_c = get_fs_count(db_fs, fs_col, year)

        if sql_c == fs_c:
            log.info("  %s year %s: %d rows -- in sync", fs_col, year, sql_c)
            continue

        log.info("  %s year %s: SQL=%d, FS=%d -> re-upload", fs_col, year, sql_c, fs_c)
        if dry_run:
            actions.append({"year": year, "sql": sql_c, "fs": fs_c})
            continue

        delete_collection(db_fs, fs_col, year)
        cursor.execute(f"SELECT * FROM [{sql_table}] WHERE Academic_Year = ?", year)
        uploaded = upload_cursor(cursor, db_fs, fs_col, skip)
        total_uploaded += uploaded
        actions.append({"year": year, "uploaded": uploaded})

    if not actions:
        log.info("  %s: checked years in sync", fs_col)

    return {"collection": fs_col, "years_synced": len(actions), "uploaded": total_uploaded, "details": actions}


def sync_students(cursor, db_fs, dry_run=False):
    """Sync enriched students (joined with latest registration)."""
    cursor.execute("SELECT COUNT(*) FROM Student")
    sql_count = cursor.fetchone()[0]
    fs_count = get_fs_count(db_fs, STUDENTS_FS)

    if sql_count == fs_count:
        log.info("  students: %d rows -- in sync, skip", sql_count)
        return {"collection": STUDENTS_FS, "action": "skip", "sql": sql_count, "fs": sql_count}

    log.info("  students: SQL=%d, FS=%d -> re-upload", sql_count, fs_count)
    if dry_run:
        return {"collection": STUDENTS_FS, "action": "dry-run", "sql": sql_count, "fs": fs_count}

    deleted = delete_collection(db_fs, STUDENTS_FS)
    cursor.execute(STUDENT_SQL)
    uploaded = upload_cursor(cursor, db_fs, STUDENTS_FS, STUDENT_SKIP)
    log.info("  students: deleted %d, uploaded %d", deleted, uploaded)
    return {"collection": STUDENTS_FS, "action": "replaced", "deleted": deleted, "uploaded": uploaded}


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Live SQL -> Firestore sync")
    parser.add_argument("--table", help="Sync only this Firestore collection name")
    parser.add_argument("--dry-run", action="store_true", help="Show diffs without uploading")
    parser.add_argument(
        "--mode",
        choices=["quick", "full"],
        default="quick",
        help="quick: current year + fees for prev year (fast). full: all years (slow, for recovery).",
    )
    parser.add_argument(
        "--year",
        help="Sync only this academic year (e.g. 25-26). Overrides --mode for year-based tables.",
    )
    parser.add_argument(
        "--preset",
        choices=list(PRESETS.keys()),
        help="Sync only tables needed for a specific feature (e.g. booksale).",
    )
    args = parser.parse_args()

    preset = PRESETS.get(args.preset) if args.preset else None

    log.info("=" * 60)
    if args.preset:
        log.info("Live SQL -> Firestore Sync  [preset=%s, year=%s]", args.preset, args.year or "current")
    elif args.year:
        log.info("Live SQL -> Firestore Sync  [year=%s]", args.year)
    else:
        log.info("Live SQL -> Firestore Sync  [mode=%s]", args.mode)
    log.info("=" * 60)

    t0 = time.time()

    # Connect
    log.info("Connecting to SQL Server ...")
    conn = connect_sql()
    cursor = conn.cursor()
    log.info("Connected")

    # Firebase
    log.info("Initializing Firebase ...")
    db_fs = init_firebase()
    if HAS_AGGREGATION:
        log.info("Firebase ready (with fast COUNT aggregation)")
    else:
        log.info("Firebase ready (aggregation unavailable, using iteration)")

    # Detect current/previous year for quick mode
    current_year = get_current_year(cursor)
    prev_year = get_previous_year(current_year) if current_year else None
    log.info("Current academic year: %s  |  Previous: %s  |  Mode: %s",
             current_year, prev_year, args.mode)

    results = []
    target = args.table

    # Students
    sync_students_flag = (not target or target == "students") and (not preset or preset.get("students"))
    if sync_students_flag:
        log.info("[students] (enriched join)")
        try:
            results.append(sync_students(cursor, db_fs, args.dry_run))
        except Exception as e:
            log.error("  students ERROR: %s", e)
            results.append({"collection": "students", "action": "error", "error": str(e)})

    # Year-based tables
    for sql_t, cfg in YEAR_TABLES.items():
        if target and cfg["fs"] != target:
            continue
        if preset and sql_t not in preset.get("year_tables", set()):
            continue
        if args.year:
            years_filter = [args.year]
        else:
            years_filter = get_years_for_table(sql_t, args.mode, current_year, prev_year)
        tier = "current-year" if sql_t in CURRENT_YEAR_TABLES else "fees" if sql_t in FEES_TABLES else "year-based"
        log.info("[%s] -> %s (%s)", sql_t, cfg["fs"], tier)
        try:
            results.append(sync_year_table(cursor, db_fs, sql_t, cfg, args.dry_run, years_filter))
        except Exception as e:
            log.error("  %s ERROR: %s", cfg["fs"], e)
            results.append({"collection": cfg["fs"], "action": "error", "error": str(e)})

    # Non-year tables
    for sql_t, cfg in NO_YEAR_TABLES.items():
        if target and cfg["fs"] != target:
            continue
        if preset and sql_t not in preset.get("no_year_tables", set()):
            continue
        log.info("[%s] -> %s (full)", sql_t, cfg["fs"])
        try:
            results.append(sync_no_year_table(cursor, db_fs, sql_t, cfg, args.dry_run))
        except Exception as e:
            log.error("  %s ERROR: %s", cfg["fs"], e)
            results.append({"collection": cfg["fs"], "action": "error", "error": str(e)})

    conn.close()

    elapsed = time.time() - t0
    log.info("-" * 60)
    log.info("Finished in %.1f s", elapsed)
    log.info("Results:\n%s", json.dumps(results, indent=2, default=str))


if __name__ == "__main__":
    main()

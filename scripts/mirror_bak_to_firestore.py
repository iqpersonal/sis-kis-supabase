"""
mirror_bak_to_firestore.py
══════════════════════════
Complete mirror of ALL tables from the restored SQL Server BAK database
to Firestore.  Each SQL table becomes a Firestore collection.

Features:
  • Resume-capable: tracks completed tables in .mirror_progress.json
  • Retry with backoff on Firestore timeouts
  • Skips empty tables (0 rows)
  • Skips oversized binary columns (>500KB)
  • Uses natural primary keys as document IDs when possible
  • Batches writes (configurable, default 200)
  • Logs everything to mirror_log.txt

Usage:
    python mirror_bak_to_firestore.py              # mirror all tables
    python mirror_bak_to_firestore.py --reset      # clear progress and start over
    python mirror_bak_to_firestore.py --table Grades  # mirror a single table
    python mirror_bak_to_firestore.py --verify     # verify counts only
"""

import os
import sys
import json
import time
import hashlib
import argparse
from datetime import date, datetime
from decimal import Decimal
from collections import defaultdict

try:
    import pyodbc
except ImportError:
    sys.exit("pyodbc required: pip install pyodbc")

try:
    import bcrypt as _bcrypt
except ImportError:
    sys.exit("bcrypt required: pip install bcrypt")

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    sys.exit("firebase-admin required: pip install firebase-admin")


def _hash_pw(val):
    """Hash a password string with bcrypt."""
    if val is None:
        return None
    plain = str(val).strip()
    if not plain:
        return None
    return _bcrypt.hashpw(plain.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")


# Columns in specific SQL tables that must be hashed before upload.
# Format: { "TableName": { "ColumnName": transform_func } }
COLUMN_TRANSFORMS = {
    "Student": {"Password": _hash_pw},
}

# ── Configuration ────────────────────────────────────────────────────
SERVER = r"localhost\SQLEXPRESS"
TEMP_DB = "_bak_import_temp"
KEY_PATH = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")

BATCH_SIZE = 200          # Firestore batch size (max 500, but 200 is safer for large docs)
MAX_RETRIES = 5           # Max retries per batch on timeout
RETRY_BASE_DELAY = 5      # Base delay in seconds for exponential backoff
MAX_DOC_SIZE_KB = 900     # Skip documents larger than this (Firestore limit is ~1MB)
SKIP_BINARY_OVER = 100_000  # Skip binary columns larger than 100KB
SKIP_STRING_OVER = 200_000  # Skip string values larger than 200KB
SQL_CHUNK_SIZE = 50_000   # Read huge tables in SQL-level chunks to avoid buffer pool OOM

PROGRESS_FILE = os.path.join(os.path.dirname(__file__), ".mirror_progress.json")
LOG_FILE = os.path.join(os.path.dirname(__file__), "mirror_log.txt")

# Collections that should NOT be overwritten (managed by generate_parent_data.py)
PROTECTED_COLLECTIONS = {
    "student_progress",
    "families",
    "parent_config",
}


# ── Helpers ──────────────────────────────────────────────────────────

def json_safe(val):
    """Convert SQL types to Firestore-compatible types."""
    if val is None:
        return None
    if isinstance(val, Decimal):
        return float(val)
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    if isinstance(val, bytes):
        if len(val) > SKIP_BINARY_OVER:
            return None  # Skip oversized binary
        return val.hex()
    if isinstance(val, str) and len(val) > SKIP_STRING_OVER:
        return None  # Skip oversized string
    if isinstance(val, float):
        # Firestore doesn't accept NaN or Infinity
        import math
        if math.isnan(val) or math.isinf(val):
            return None
    return val


def table_to_collection_name(table_name):
    """Convert SQL table name to a Firestore collection name.
    Prefix with 'raw_' to avoid conflicts with existing collections.
    """
    name = table_name.strip()
    # Use raw_ prefix for all mirrored tables to separate from app collections
    return f"raw_{name}"


def get_primary_key_columns(cursor, table_name):
    """Get primary key columns for a table, if any."""
    cursor.execute("""
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE OBJECTPROPERTY(OBJECT_ID(CONSTRAINT_SCHEMA + '.' + QUOTENAME(CONSTRAINT_NAME)), 'IsPrimaryKey') = 1
          AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
    """, (table_name,))
    return [r.COLUMN_NAME for r in cursor.fetchall()]


def make_doc_id(row_dict, pk_columns):
    """Create a deterministic document ID from primary key values."""
    if not pk_columns:
        return None  # Will use auto-ID
    parts = []
    for col in pk_columns:
        val = row_dict.get(col)
        if val is None:
            return None  # Can't form a complete key
        parts.append(str(val).strip())
    doc_id = "__".join(parts)
    # Firestore doc IDs can't exceed 1500 bytes
    if len(doc_id.encode("utf-8")) > 1500:
        doc_id = hashlib.md5(doc_id.encode("utf-8")).hexdigest()
    # Firestore doc IDs can't contain '/'
    doc_id = doc_id.replace("/", "_")
    return doc_id


def estimate_doc_size(doc):
    """Rough estimate of document size in KB."""
    return len(json.dumps(doc, default=str).encode("utf-8")) / 1024


def load_progress():
    """Load progress tracker."""
    if os.path.exists(PROGRESS_FILE):
        try:
            with open(PROGRESS_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {"completed": {}, "failed": {}, "skipped": {}}


def save_progress(progress):
    """Save progress tracker."""
    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f, indent=2)


def log(msg, also_print=True):
    """Log message to file and optionally print."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] {msg}"
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(line + "\n")
    if also_print:
        print(msg)


def commit_with_retry(batch, batch_num, table_name):
    """Commit a Firestore batch with exponential backoff retry."""
    for attempt in range(MAX_RETRIES):
        try:
            batch.commit()
            return True
        except Exception as e:
            err_str = str(e)
            if "DEADLINE_EXCEEDED" in err_str or "504" in err_str or "Unavailable" in err_str:
                delay = RETRY_BASE_DELAY * (2 ** attempt)
                log(f"    ⚠ Batch {batch_num} timeout (attempt {attempt+1}/{MAX_RETRIES}), retrying in {delay}s...")
                time.sleep(delay)
            else:
                log(f"    ✗ Batch {batch_num} failed: {e}")
                raise
    raise Exception(f"Batch {batch_num} failed after {MAX_RETRIES} retries")


# ── Main Upload Logic ────────────────────────────────────────────────

def get_all_tables_with_counts(cursor):
    """Get all user tables with row counts."""
    cursor.execute("""
        SELECT t.TABLE_NAME,
               SUM(p.rows) AS row_count
        FROM INFORMATION_SCHEMA.TABLES t
        JOIN sys.partitions p
          ON OBJECT_ID(t.TABLE_SCHEMA + '.' + t.TABLE_NAME) = p.object_id
          AND p.index_id IN (0, 1)
        WHERE t.TABLE_TYPE = 'BASE TABLE'
        GROUP BY t.TABLE_NAME
        ORDER BY SUM(p.rows) ASC
    """)
    return [(r.TABLE_NAME, r.row_count) for r in cursor.fetchall()]


def upload_table(cursor, db_fs, table_name, row_count, progress, batch_size=BATCH_SIZE):
    """Upload one SQL table to Firestore. Returns (uploaded_count, status).
    For large tables (> SQL_CHUNK_SIZE rows), reads in SQL-level chunks
    using OFFSET/FETCH to avoid SQL Server buffer pool OOM.
    """
    collection_name = table_to_collection_name(table_name)

    # Skip protected collections
    if collection_name.replace("raw_", "") in PROTECTED_COLLECTIONS:
        log(f"  SKIP {table_name} (protected collection)")
        return 0, "skipped"

    # Get primary key for deterministic doc IDs
    pk_cols = get_primary_key_columns(cursor, table_name)
    pk_info = f"PK: {','.join(pk_cols)}" if pk_cols else "auto-ID"

    log(f"\n  [{table_name}] → '{collection_name}' ({row_count:,} rows, {pk_info})")

    coll_ref = db_fs.collection(collection_name)
    total = 0
    skipped_docs = 0
    auto_id_counter = 0
    use_chunked = row_count > SQL_CHUNK_SIZE

    if use_chunked:
        # Determine ORDER BY columns for OFFSET/FETCH
        order_cols = pk_cols if pk_cols else None
        if not order_cols:
            # Get first column as fallback ordering
            cursor.execute(f"SELECT TOP 1 * FROM [{table_name}]")
            order_cols = [cursor.description[0][0]]
            cursor.fetchall()  # consume

        order_by = ", ".join(f"[{c}]" for c in order_cols)
        log(f"    (chunked mode: {SQL_CHUNK_SIZE:,} rows/chunk, ORDER BY {','.join(order_cols)})")

        offset = 0
        cols = None

        while offset < row_count:
            chunk_sql = f"SELECT * FROM [{table_name}] ORDER BY {order_by} OFFSET {offset} ROWS FETCH NEXT {SQL_CHUNK_SIZE} ROWS ONLY"
            try:
                cursor.execute(chunk_sql)
            except Exception as e:
                log(f"    ✗ SQL chunk read error at offset {offset}: {e}")
                return total, "failed"

            if cols is None:
                cols = [c[0] for c in cursor.description]

            chunk_rows = cursor.fetchall()
            if not chunk_rows:
                break

            batch = db_fs.batch()
            batch_count = 0
            batch_num = total // batch_size  # approximate batch numbering

            for row in chunk_rows:
                doc = {}
                for i, col in enumerate(cols):
                    val = json_safe(row[i])
                    if val is not None:
                        doc[col] = val

                # Apply column transforms (e.g. hash passwords)
                transforms = COLUMN_TRANSFORMS.get(table_name, {})
                for col_name, fn in transforms.items():
                    if col_name in doc:
                        doc[col_name] = fn(doc[col_name])

                size_kb = estimate_doc_size(doc)
                if size_kb > MAX_DOC_SIZE_KB:
                    skipped_docs += 1
                    continue

                doc_id = make_doc_id(doc, pk_cols)
                if doc_id:
                    ref = coll_ref.document(doc_id)
                else:
                    auto_id_counter += 1
                    ref = coll_ref.document(f"row_{auto_id_counter:08d}")

                batch.set(ref, doc)
                batch_count += 1
                total += 1

                if batch_count >= batch_size:
                    batch_num += 1
                    commit_with_retry(batch, batch_num, table_name)
                    batch = db_fs.batch()
                    batch_count = 0
                    if total % 5000 == 0:
                        log(f"    {total:,}/{row_count:,}...")

            # Final batch for this chunk
            if batch_count > 0:
                batch_num += 1
                commit_with_retry(batch, batch_num, table_name)
                if total % 5000 != 0:
                    log(f"    {total:,}/{row_count:,}...")

            offset += SQL_CHUNK_SIZE

    else:
        # Original non-chunked path for smaller tables
        try:
            cursor.execute(f"SELECT * FROM [{table_name}]")
        except Exception as e:
            log(f"    ✗ SQL read error: {e}")
            return 0, "failed"

        cols = [c[0] for c in cursor.description]

        batch = db_fs.batch()
        batch_count = 0
        batch_num = 0

        for row in cursor:
            doc = {}
            for i, col in enumerate(cols):
                val = json_safe(row[i])
                if val is not None:
                    doc[col] = val

            # Apply column transforms (e.g. hash passwords)
            transforms = COLUMN_TRANSFORMS.get(table_name, {})
            for col_name, fn in transforms.items():
                if col_name in doc:
                    doc[col_name] = fn(doc[col_name])

            size_kb = estimate_doc_size(doc)
            if size_kb > MAX_DOC_SIZE_KB:
                skipped_docs += 1
                continue

            doc_id = make_doc_id(doc, pk_cols)
            if doc_id:
                ref = coll_ref.document(doc_id)
            else:
                auto_id_counter += 1
                ref = coll_ref.document(f"row_{auto_id_counter:08d}")

            batch.set(ref, doc)
            batch_count += 1
            total += 1

            if batch_count >= batch_size:
                batch_num += 1
                commit_with_retry(batch, batch_num, table_name)
                batch = db_fs.batch()
                batch_count = 0
                if total % 5000 == 0:
                    log(f"    {total:,}/{row_count:,}...")

        if batch_count > 0:
            batch_num += 1
            commit_with_retry(batch, batch_num, table_name)

    status_msg = f"✓ {total:,} docs uploaded"
    if skipped_docs:
        status_msg += f" ({skipped_docs} oversized docs skipped)"
    log(f"    {status_msg}")

    return total, "completed"


def verify_table(cursor, db_fs, table_name):
    """Verify Firestore collection count matches SQL table."""
    collection_name = table_to_collection_name(table_name)

    cursor.execute(f"SELECT COUNT(*) FROM [{table_name}]")
    sql_count = cursor.fetchone()[0]

    # Count Firestore docs (streaming to handle large collections)
    fs_count = 0
    for _ in db_fs.collection(collection_name).stream():
        fs_count += 1

    match = sql_count == fs_count
    symbol = "✓" if match else "✗"
    return sql_count, fs_count, match, symbol


def main():
    parser = argparse.ArgumentParser(description="Mirror SQL Server BAK to Firestore")
    parser.add_argument("--reset", action="store_true", help="Clear progress and start over")
    parser.add_argument("--table", type=str, help="Mirror a single table")
    parser.add_argument("--verify", action="store_true", help="Verify counts only")
    parser.add_argument("--skip-empty", action="store_true", default=True, help="Skip empty tables (default)")
    parser.add_argument("--include-empty", action="store_true", help="Include empty tables")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE, help=f"Batch size (default {BATCH_SIZE})")
    args = parser.parse_args()

    effective_batch_size = args.batch_size

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

    log(f"\n{'='*70}")
    log(f"BAK → Firestore Full Mirror")
    log(f"{'='*70}")
    log(f"Server: {SERVER}/{TEMP_DB}")
    log(f"Batch size: {effective_batch_size}")

    # ── Get all tables ──
    all_tables = get_all_tables_with_counts(cursor)
    non_empty = [(n, c) for n, c in all_tables if c > 0]
    total_rows = sum(c for _, c in all_tables)

    log(f"Total tables: {len(all_tables)} ({len(non_empty)} non-empty)")
    log(f"Total rows: {total_rows:,}")

    # ── Verify mode ──
    if args.verify:
        log(f"\n── Verification Mode ──")
        ok = 0
        mismatch = 0
        missing = 0
        for table_name, sql_rows in sorted(non_empty, key=lambda x: x[0]):
            if args.table and table_name != args.table:
                continue
            try:
                sql_count, fs_count, match, symbol = verify_table(cursor, db_fs, table_name)
                status = "MATCH" if match else f"DIFF (SQL:{sql_count}, FS:{fs_count})"
                log(f"  {symbol} {table_name:<45} {status}")
                if match:
                    ok += 1
                else:
                    mismatch += 1
            except Exception as e:
                log(f"  ? {table_name:<45} ERROR: {e}")
                missing += 1
        log(f"\nResults: {ok} match, {mismatch} mismatch, {missing} error")
        conn.close()
        return

    # ── Single table mode ──
    if args.table:
        found = [(n, c) for n, c in all_tables if n == args.table]
        if not found:
            log(f"Table '{args.table}' not found!")
            conn.close()
            return
        table_name, row_count = found[0]
        try:
            uploaded, status = upload_table(cursor, db_fs, table_name, row_count, {}, effective_batch_size)
            log(f"\nDone: {uploaded:,} docs uploaded to '{table_to_collection_name(table_name)}'")
        except Exception as e:
            log(f"\nFailed: {e}")
        conn.close()
        return

    # ── Full mirror mode ──
    progress = load_progress()
    if args.reset:
        progress = {"completed": {}, "failed": {}, "skipped": {}}
        save_progress(progress)
        log("Progress reset.")

    # Filter to non-empty tables (unless --include-empty)
    tables_to_process = non_empty if not args.include_empty else all_tables

    # Skip already completed
    remaining = [(n, c) for n, c in tables_to_process if n not in progress["completed"]]
    already_done = len(tables_to_process) - len(remaining)

    log(f"\nTables to process: {len(remaining)} ({already_done} already completed)")
    remaining_rows = sum(c for _, c in remaining)
    log(f"Rows to upload: {remaining_rows:,}")

    start_time = time.time()
    success = 0
    failed = 0

    for idx, (table_name, row_count) in enumerate(remaining, 1):
        log(f"\n[{idx}/{len(remaining)}] Processing {table_name} ({row_count:,} rows)...")

        try:
            uploaded, status = upload_table(cursor, db_fs, table_name, row_count, progress, effective_batch_size)

            if status == "completed":
                progress["completed"][table_name] = {
                    "rows": row_count,
                    "uploaded": uploaded,
                    "collection": table_to_collection_name(table_name),
                    "time": datetime.now().isoformat(),
                }
                success += 1
            elif status == "skipped":
                progress["skipped"][table_name] = {"reason": "protected"}
            else:
                progress["failed"][table_name] = {"rows": row_count, "status": status}
                failed += 1

            save_progress(progress)

        except Exception as e:
            log(f"  ✗ FATAL ERROR on {table_name}: {e}")
            progress["failed"][table_name] = {"rows": row_count, "error": str(e)}
            save_progress(progress)
            failed += 1

    elapsed = time.time() - start_time
    minutes = elapsed / 60

    log(f"\n{'='*70}")
    log(f"Mirror Complete!")
    log(f"{'='*70}")
    log(f"  Succeeded: {success}")
    log(f"  Failed:    {failed}")
    log(f"  Skipped:   {len(progress.get('skipped', {}))}")
    log(f"  Total completed: {len(progress['completed'])}")
    log(f"  Time: {minutes:.1f} minutes")
    log(f"{'='*70}")

    cursor.close()
    conn.close()


if __name__ == "__main__":
    main()

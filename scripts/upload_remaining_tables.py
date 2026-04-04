"""
upload_remaining_tables.py
═══════════════════════════
Upload the 3 remaining failed tables to Firestore, year by year.
Each Academic_Year is a separate SQL query → no memory buildup.

Tables: Student_Invoice (40K), Grades (1.6M), tbl_Quiz_Grades (3.6M)
Skips: tbDBLog (audit log, not relevant)

Features:
  • Year-by-year SQL queries (small, safe)
  • Fresh SQL connection per year (releases buffer pool)
  • Resume-capable via progress file
  • Live progress bar with ETA
  • Retry with backoff on Firestore timeouts
"""

import os
import sys
import json
import time
import hashlib
from datetime import date, datetime
from decimal import Decimal

import pyodbc
import firebase_admin
from firebase_admin import credentials, firestore

# ── Config ───────────────────────────────────────────────────────────
SERVER = r"localhost\SQLEXPRESS"
TEMP_DB = "_bak_import_temp"
KEY_PATH = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")

BATCH_SIZE = 200
MAX_RETRIES = 5
RETRY_BASE_DELAY = 5

PROGRESS_FILE = os.path.join(os.path.dirname(__file__), ".remaining_progress.json")

# Tables to upload with their year values (from _check_years.py)
TABLES = {
    "Student_Invoice": {
        "collection": "raw_Student_Invoice",
        "pk_cols": ["School_Code", "Branch_Code", "Academic_Year", "Invoice_Sequence"],
        "years": ["19-20", "20-21", "21-22", "22-23", "23-24", "24-25", "25-26", "26-27"],
    },
    "Grades": {
        "collection": "raw_Grades",
        "pk_cols": ["Academic_Year", "Student_Number", "Registration_Serial_Number", "Subject_Code", "Exam_Code"],
        "years": ["16-17", "17-18", "18-19", "19-20", "20-21", "21-22", "22-23", "23-24", "24-25", "25-26"],
    },
    "tbl_Quiz_Grades": {
        "collection": "raw_tbl_Quiz_Grades",
        "pk_cols": ["Academic_Year", "Student_Number", "Registration_Serial_Number", "Subject_Code", "Exam_Code", "Quiz_Code"],
        "years": ["16-17", "17-18", "18-19", "19-20", "20-21", "21-22", "22-23", "23-24", "24-25", "25-26"],
    },
}


# ── Helpers ──────────────────────────────────────────────────────────

def now_str():
    return datetime.now().strftime("%H:%M:%S")


def log(msg):
    print(f"[{now_str()}] {msg}", flush=True)


def json_safe(val):
    if val is None:
        return None
    if isinstance(val, Decimal):
        return float(val)
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    if isinstance(val, bytes):
        if len(val) > 100_000:
            return None
        return val.hex()
    if isinstance(val, str) and len(val) > 200_000:
        return None
    if isinstance(val, float):
        import math
        if math.isnan(val) or math.isinf(val):
            return None
    return val


def make_doc_id(row_dict, pk_cols):
    if not pk_cols:
        return None
    parts = []
    for col in pk_cols:
        val = row_dict.get(col)
        if val is None:
            return None
        parts.append(str(val).strip())
    doc_id = "__".join(parts)
    if len(doc_id.encode("utf-8")) > 1500:
        doc_id = hashlib.md5(doc_id.encode("utf-8")).hexdigest()
    doc_id = doc_id.replace("/", "_")
    return doc_id


def get_connection():
    return pyodbc.connect(
        f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={SERVER};"
        f"DATABASE={TEMP_DB};Trusted_Connection=yes",
        autocommit=True,
    )


def commit_with_retry(batch, batch_num, label):
    for attempt in range(MAX_RETRIES):
        try:
            batch.commit()
            return True
        except Exception as e:
            err_str = str(e)
            if "DEADLINE_EXCEEDED" in err_str or "504" in err_str or "Unavailable" in err_str:
                delay = RETRY_BASE_DELAY * (2 ** attempt)
                log(f"  ⚠ Batch {batch_num} timeout (attempt {attempt+1}/{MAX_RETRIES}), retry in {delay}s...")
                time.sleep(delay)
            else:
                log(f"  ✗ Batch {batch_num} error: {e}")
                raise
    raise Exception(f"Batch {batch_num} failed after {MAX_RETRIES} retries")


def load_progress():
    if os.path.exists(PROGRESS_FILE):
        try:
            with open(PROGRESS_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def save_progress(progress):
    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f, indent=2)


def format_time(seconds):
    if seconds < 60:
        return f"{seconds:.0f}s"
    minutes = seconds / 60
    if minutes < 60:
        return f"{minutes:.1f}m"
    hours = minutes / 60
    return f"{hours:.1f}h"


def progress_bar(current, total, width=30):
    pct = current / total if total > 0 else 0
    filled = int(width * pct)
    bar = "█" * filled + "░" * (width - filled)
    return f"|{bar}| {pct*100:.1f}%"


# ── Upload one year of one table ─────────────────────────────────────

SQL_CHUNK = 50_000  # rows per SQL query chunk (prevents OOM)

def upload_year(db_fs, table_name, year, config):
    """Upload one Academic_Year slice, sub-chunking large years. Returns uploaded count."""
    collection_name = config["collection"]
    pk_cols = config["pk_cols"]
    coll_ref = db_fs.collection(collection_name)

    # Get count with a fresh connection
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(f"SELECT COUNT(*) FROM [{table_name}] WHERE [Academic_Year] = ?", (year,))
    year_count = cursor.fetchone()[0]
    conn.close()

    if year_count == 0:
        log(f"  {year}: 0 rows — skipped")
        return 0

    log(f"  {year}: {year_count:,} rows — uploading...")

    # Build ORDER BY from PK columns for deterministic OFFSET/FETCH
    order_cols = ", ".join(f"[{c}]" for c in pk_cols)

    batch = db_fs.batch()
    batch_count = 0
    batch_num = 0
    total = 0
    auto_id = 0
    start = time.time()
    offset = 0

    while offset < year_count:
        # Fresh connection for EACH chunk — critical to release SQL buffer pool
        conn = get_connection()
        cursor = conn.cursor()

        chunk_size = min(SQL_CHUNK, year_count - offset)
        sql = (
            f"SELECT * FROM [{table_name}] "
            f"WHERE [Academic_Year] = ? "
            f"ORDER BY {order_cols} "
            f"OFFSET {offset} ROWS FETCH NEXT {chunk_size} ROWS ONLY"
        )
        cursor.execute(sql, (year,))
        cols = [c[0] for c in cursor.description]

        chunk_rows = 0
        for row in cursor:
            doc = {}
            for i, col in enumerate(cols):
                val = json_safe(row[i])
                if val is not None:
                    doc[col] = val

            doc_id = make_doc_id(doc, pk_cols)
            if doc_id:
                ref = coll_ref.document(doc_id)
            else:
                auto_id += 1
                ref = coll_ref.document(f"{year}_{auto_id:08d}")

            batch.set(ref, doc)
            batch_count += 1
            total += 1
            chunk_rows += 1

            if batch_count >= BATCH_SIZE:
                batch_num += 1
                commit_with_retry(batch, batch_num, f"{table_name}/{year}")
                batch = db_fs.batch()
                batch_count = 0

                # Live progress every 2000 rows
                if total % 2000 == 0:
                    elapsed = time.time() - start
                    rate = total / elapsed if elapsed > 0 else 0
                    remaining = (year_count - total) / rate if rate > 0 else 0
                    bar = progress_bar(total, year_count)
                    print(f"\r    {bar} {total:,}/{year_count:,}  ({rate:.0f} rows/s, ETA {format_time(remaining)})    ", end="", flush=True)

        # Close connection BEFORE next chunk — releases buffer pool
        conn.close()
        offset += chunk_rows if chunk_rows > 0 else chunk_size

    # Final batch
    if batch_count > 0:
        batch_num += 1
        commit_with_retry(batch, batch_num, f"{table_name}/{year}")

    elapsed = time.time() - start
    rate = total / elapsed if elapsed > 0 else 0
    print(f"\r    {progress_bar(total, year_count)} {total:,}/{year_count:,}  ✓ done in {format_time(elapsed)} ({rate:.0f} rows/s)        ", flush=True)

    return total


# ── Main ─────────────────────────────────────────────────────────────

def main():
    log("=" * 60)
    log("Upload Remaining Tables — Year by Year")
    log("=" * 60)

    # Init Firebase
    if not firebase_admin._apps:
        cred = credentials.Certificate(KEY_PATH)
        firebase_admin.initialize_app(cred)
    db_fs = firestore.client()

    progress = load_progress()

    # Calculate totals
    total_rows = 0
    total_tasks = 0
    done_tasks = 0
    for table_name, config in TABLES.items():
        for year in config["years"]:
            key = f"{table_name}__{year}"
            total_tasks += 1
            if key in progress:
                done_tasks += 1

    log(f"Tasks: {done_tasks}/{total_tasks} already completed")
    log("")

    grand_total = 0
    grand_start = time.time()
    failed = []

    for table_name, config in TABLES.items():
        log(f"{'─' * 50}")
        log(f"TABLE: {table_name} → {config['collection']}")
        log(f"{'─' * 50}")

        table_total = 0
        for year in config["years"]:
            key = f"{table_name}__{year}"

            if key in progress:
                prev = progress[key]
                log(f"  {year}: {prev['uploaded']:,} rows — already done ✓")
                table_total += prev["uploaded"]
                continue

            try:
                uploaded = upload_year(db_fs, table_name, year, config)
                progress[key] = {
                    "uploaded": uploaded,
                    "time": datetime.now().isoformat(),
                }
                save_progress(progress)
                table_total += uploaded
                grand_total += uploaded
            except Exception as e:
                log(f"  ✗ FAILED {table_name}/{year}: {e}")
                failed.append(f"{table_name}/{year}")
                # Continue with next year — don't stop everything

        log(f"  → {table_name} total: {table_total:,} rows uploaded")
        log("")

    elapsed = time.time() - grand_start
    log("=" * 60)
    log(f"ALL DONE!")
    log(f"  Uploaded this run: {grand_total:,} rows")
    log(f"  Time: {format_time(elapsed)}")
    if failed:
        log(f"  Failed: {', '.join(failed)}")
    else:
        log(f"  Failed: 0")
    log("=" * 60)


if __name__ == "__main__":
    main()

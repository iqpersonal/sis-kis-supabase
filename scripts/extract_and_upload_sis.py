"""
extract_and_upload_sis.py
-------------------------
1. Restores .bak to a temp DB in SQL Server
2. Extracts key tables directly via SQL queries
3. Uploads to Firestore in separate collections
4. Drops the temp DB

Usage:
  pip install pyodbc firebase-admin
  python extract_and_upload_sis.py
"""

import json
import os
import sys
from datetime import date, datetime
from decimal import Decimal

try:
    import pyodbc
except ImportError:
    sys.exit("pyodbc is required. Install with: pip install pyodbc")

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    sys.exit("firebase-admin is required. Install with: pip install firebase-admin")


# ── Config ───────────────────────────────────────────────────────────────────

BAK_PATH = r"C:\temp\khaled-sisnet-ITdept_backup_2026_03_04.bak"
SERVER = r"localhost\SQLEXPRESS"
TEMP_DB = "_bak_import_temp"
BATCH_SIZE = 400

# Key tables to extract: SQL table name -> Firestore collection name
KEY_TABLES = {
    "Student":              "students",
    "Sponsor":              "sponsors",
    "Registration":         "registrations",
    "Registration_Status":  "registration_status",
    "Student_Charges":      "student_charges",
    "Student_Discount":     "student_discounts",
    "Student_Installments": "student_installments",
    "Student_Invoice":      "student_invoices",
    "Student_Absence":      "student_absence",
    "Student_Exam_Results": "student_exam_results",
    "Student_Tardy":        "student_tardy",
    "Section":              "sections",
    "Section_Avg":          "section_averages",
    "Class":                "classes",
    "Class_Subjects":       "class_subjects",
    "Subject":              "subjects",
    "Employee":             "employees",
    "Academic_Year":        "academic_years",
    "Charge_Type":          "charge_types",
    "Nationality":          "nationalities",
    "Exams":                "exams",
    "Branch":               "branches",
    "School":               "schools",
}


# ── Helpers ──────────────────────────────────────────────────────────────────

def json_safe(val):
    """Convert to JSON/Firestore-safe value."""
    if val is None:
        return None
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    if isinstance(val, Decimal):
        return float(val)
    if isinstance(val, bytes):
        # Skip large binary blobs
        if len(val) > 1000:
            return None
        return val.hex()
    if isinstance(val, str):
        if len(val) > 10000:
            return val[:10000]
        return val
    if isinstance(val, (int, float, bool)):
        return val
    return str(val)


def connect_sql(server, database="master"):
    """Connect to SQL Server."""
    drivers = [d for d in pyodbc.drivers() if "SQL Server" in d]
    if not drivers:
        sys.exit("No SQL Server ODBC driver found.")
    driver = drivers[0]
    print(f"Using ODBC driver: {driver}")
    conn_str = (
        f"DRIVER={{{driver}}};"
        f"SERVER={server};"
        f"DATABASE={database};"
        f"Trusted_Connection=yes;"
        f"Connection Timeout=30;"
    )
    return pyodbc.connect(conn_str, autocommit=True)


def restore_bak(conn, bak_path):
    """Restore .bak to temp database."""
    cursor = conn.cursor()

    cursor.execute(f"RESTORE FILELISTONLY FROM DISK = N'{bak_path}'")
    files = cursor.fetchall()

    data_file = log_file = None
    for f in files:
        if str(f.Type) == "D" and data_file is None:
            data_file = f.LogicalName
        elif str(f.Type) == "L" and log_file is None:
            log_file = f.LogicalName

    if not data_file or not log_file:
        sys.exit("Could not determine logical file names from .bak")

    # Get SQL Server's default data directory
    cursor.execute(
        "SELECT SERVERPROPERTY('InstanceDefaultDataPath') AS DataPath, "
        "SERVERPROPERTY('InstanceDefaultLogPath') AS LogPath"
    )
    row = cursor.fetchone()
    if row and row.DataPath:
        data_dir = row.DataPath.rstrip("\\")
        log_dir = (row.LogPath or row.DataPath).rstrip("\\")
    else:
        data_dir = os.path.dirname(bak_path)
        log_dir = data_dir

    mdf = os.path.join(data_dir, f"{TEMP_DB}.mdf")
    ldf = os.path.join(log_dir, f"{TEMP_DB}_log.ldf")

    sql = f"""
        RESTORE DATABASE [{TEMP_DB}]
        FROM DISK = N'{bak_path}'
        WITH REPLACE,
             MOVE N'{data_file}' TO N'{mdf}',
             MOVE N'{log_file}'  TO N'{ldf}'
    """
    print(f"Restoring {bak_path} -> [{TEMP_DB}] ...")
    cursor.execute(sql)
    while cursor.nextset():
        pass
    cursor.close()
    print("Restore complete.")


def drop_temp_db(conn):
    """Drop temporary database."""
    try:
        cursor = conn.cursor()
        cursor.execute("USE [master]")
        cursor.execute(f"""
            IF DB_ID('{TEMP_DB}') IS NOT NULL
            BEGIN
                ALTER DATABASE [{TEMP_DB}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
                DROP DATABASE [{TEMP_DB}];
            END
        """)
        cursor.close()
        print(f"Dropped [{TEMP_DB}].")
    except Exception as e:
        print(f"Warning: could not drop temp DB: {e}")


def extract_table(conn, table_name):
    """Extract all rows from a table as list of dicts."""
    cursor = conn.cursor()
    cursor.execute(f"SELECT * FROM [dbo].[{table_name}]")
    columns = [col[0] for col in cursor.description]
    rows = []
    for row in cursor.fetchall():
        record = {}
        for col, val in zip(columns, row):
            record[col] = json_safe(val)
        rows.append(record)
    cursor.close()
    return rows


def init_firebase():
    """Initialize Firebase Admin SDK."""
    search_paths = [
        os.path.join(os.path.dirname(__file__), "..", "dashboard", "serviceAccountKey.json"),
        os.path.join(os.path.dirname(__file__), "serviceAccountKey.json"),
    ]
    env = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")
    if env:
        search_paths.append(env)

    cred_path = None
    for p in search_paths:
        if p and os.path.isfile(p):
            cred_path = os.path.abspath(p)
            break

    if not cred_path:
        sys.exit(
            "serviceAccountKey.json not found!\n"
            "Place it in dashboard/ or scripts/ folder.\n"
            "Download from: Firebase Console > Project Settings > Service Accounts > Generate New Private Key"
        )

    print(f"Firebase credentials: {cred_path}")
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)
    return firestore.client()


def upload_to_firestore(db, collection_name, records):
    """Upload records to Firestore collection."""
    if not records:
        return 0

    total = len(records)
    uploaded = 0

    for i in range(0, total, BATCH_SIZE):
        batch = db.batch()
        chunk = records[i:i + BATCH_SIZE]
        for record in chunk:
            doc_ref = db.collection(collection_name).document()
            batch.set(doc_ref, record)
        batch.commit()
        uploaded += len(chunk)
        print(f"    {uploaded}/{total} ({uploaded * 100 // total}%)")

    return uploaded


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("SiS Database -> Firestore Upload")
    print("=" * 60)

    # 1. Connect to SQL Server
    print(f"\nConnecting to {SERVER} ...")
    conn = connect_sql(SERVER)

    try:
        # 2. Restore .bak
        restore_bak(conn, BAK_PATH)

        # 3. Switch to temp DB
        conn.close()
        conn = connect_sql(SERVER, TEMP_DB)

        # 4. Initialize Firestore
        db = init_firebase()

        # 5. Extract and upload each key table
        print(f"\nExtracting and uploading {len(KEY_TABLES)} tables...\n")
        summary = []

        for table_name, collection_name in KEY_TABLES.items():
            print(f"[{table_name}] -> Firestore/{collection_name}")
            try:
                records = extract_table(conn, table_name)
                print(f"  Extracted {len(records)} rows")

                if records:
                    uploaded = upload_to_firestore(db, collection_name, records)
                    summary.append((table_name, collection_name, uploaded))
                else:
                    summary.append((table_name, collection_name, 0))
            except Exception as e:
                print(f"  ERROR: {e}")
                summary.append((table_name, collection_name, -1))

        # 6. Print summary
        print("\n" + "=" * 60)
        print("Upload Summary")
        print("=" * 60)
        total = 0
        for t, c, count in summary:
            status = f"{count} rows" if count >= 0 else "FAILED"
            print(f"  {t:30s} -> {c:25s} : {status}")
            if count > 0:
                total += count
        print(f"\nTotal records uploaded: {total:,}")

    finally:
        # 7. Drop temp DB and close
        conn.close()
        conn = connect_sql(SERVER)
        drop_temp_db(conn)
        conn.close()


if __name__ == "__main__":
    main()

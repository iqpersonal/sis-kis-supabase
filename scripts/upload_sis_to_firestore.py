"""
upload_sis_to_firestore.py
--------------------------
Reads the large extracted JSON from the SiS database and uploads key tables
to Firestore in separate collections.

Usage:
  pip install firebase-admin
  python upload_sis_to_firestore.py --json "C:\temp\test_output.json"
"""

import argparse
import json
import os
import sys
from datetime import datetime

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    sys.exit("firebase-admin is required. Install with: pip install firebase-admin")

# Tables to extract and their Firestore collection names
KEY_TABLES = {
    "Student": "students",
    "Registration": "registrations",
    "Registration_Status": "registration_status",
    "Student_Charges": "student_charges",
    "Student_Discount": "student_discounts",
    "Student_Installments": "student_installments",
    "Student_Invoice": "student_invoices",
    "Student_Absence": "student_absence",
    "Student_Exam_Results": "student_exam_results",
    "Section": "sections",
    "Section_Avg": "section_averages",
    "Sponsor": "sponsors",
    "Class": "classes",
    "Class_Subjects": "class_subjects",
    "Subject": "subjects",
    "Employee": "employees",
    "Tardy": "tardy",
    "Academic_Year": "academic_years",
    "Charge_Type": "charge_types",
    "Nationality": "nationalities",
    "Exams": "exams",
    "Branch": "branches",
    "School": "schools",
}

BATCH_SIZE = 400  # Firestore batch limit is 500


def clean_value(val):
    """Convert values to Firestore-compatible types."""
    if val is None:
        return None
    if isinstance(val, str):
        # Truncate extremely long strings
        return val[:10000] if len(val) > 10000 else val
    if isinstance(val, (int, float, bool)):
        return val
    if isinstance(val, bytes):
        return val.hex()
    return str(val)


def clean_record(record: dict) -> dict:
    """Clean a record for Firestore upload."""
    cleaned = {}
    for k, v in record.items():
        cleaned[k] = clean_value(v)
    return cleaned


def init_firebase():
    """Initialize Firebase Admin SDK."""
    # Look for service account key
    search_paths = [
        os.path.join(os.path.dirname(__file__), "..", "dashboard", "serviceAccountKey.json"),
        os.path.join(os.path.dirname(__file__), "serviceAccountKey.json"),
        os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", ""),
    ]

    cred_path = None
    for p in search_paths:
        if p and os.path.isfile(p):
            cred_path = os.path.abspath(p)
            break

    if not cred_path:
        sys.exit(
            "serviceAccountKey.json not found. Place it in dashboard/ or scripts/ folder.\n"
            "Download from: Firebase Console > Project Settings > Service Accounts > Generate New Private Key"
        )

    print(f"Using credentials: {cred_path}")
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)
    return firestore.client()


def stream_tables(json_path: str, table_names: set):
    """Stream-read the JSON file and extract only the needed tables."""
    print(f"Reading {json_path} ...")
    
    # For large files, we read in a streaming fashion
    # Since the file is a dict of table_name -> array, we'll parse it fully
    # but only keep the tables we need
    with open(json_path, "r", encoding="utf-8", errors="replace") as f:
        data = json.load(f)
    
    if not isinstance(data, dict):
        sys.exit("Expected JSON to be a dict of table_name -> array")
    
    result = {}
    for table_name in table_names:
        if table_name in data:
            rows = data[table_name]
            if isinstance(rows, list):
                result[table_name] = rows
                print(f"  {table_name}: {len(rows)} rows")
            else:
                print(f"  {table_name}: not an array, skipping")
        else:
            print(f"  {table_name}: not found in JSON")
    
    return result


def upload_collection(db, collection_name: str, records: list, table_name: str):
    """Upload records to a Firestore collection in batches."""
    if not records:
        print(f"  {table_name} -> {collection_name}: empty, skipping")
        return 0

    total = len(records)
    uploaded = 0
    
    for i in range(0, total, BATCH_SIZE):
        batch = db.batch()
        chunk = records[i:i + BATCH_SIZE]
        
        for idx, record in enumerate(chunk):
            cleaned = clean_record(record)
            doc_ref = db.collection(collection_name).document()
            batch.set(doc_ref, cleaned)
        
        batch.commit()
        uploaded += len(chunk)
        pct = (uploaded / total) * 100
        print(f"  {table_name} -> {collection_name}: {uploaded}/{total} ({pct:.0f}%)")
    
    return uploaded


def main():
    parser = argparse.ArgumentParser(description="Upload SiS data to Firestore")
    parser.add_argument("--json", required=True, help="Path to the extracted JSON file")
    parser.add_argument(
        "--tables", nargs="*", default=None,
        help="Specific table names to upload (default: all key tables)"
    )
    args = parser.parse_args()

    if not os.path.isfile(args.json):
        sys.exit(f"File not found: {args.json}")

    db = init_firebase()

    # Determine which tables to extract
    if args.tables:
        table_map = {t: t.lower() for t in args.tables}
    else:
        table_map = KEY_TABLES

    print(f"\nWill extract {len(table_map)} tables from the JSON file.\n")
    
    # Read data
    tables_data = stream_tables(args.json, set(table_map.keys()))

    # Upload each table
    print(f"\nUploading to Firestore...")
    total_uploaded = 0
    for table_name, collection_name in table_map.items():
        records = tables_data.get(table_name, [])
        count = upload_collection(db, collection_name, records, table_name)
        total_uploaded += count

    print(f"\nDone! Uploaded {total_uploaded} total records across {len(table_map)} collections.")


if __name__ == "__main__":
    main()

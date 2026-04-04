"""
extract_staff_to_firestore.py
─────────────────────────────
Extracts staff data from SQL Server (tblStaff + tblStaffPersons + tblStaffContracts)
and uploads to Firestore `staff` and `departments` collections.

Usage:
  python extract_staff_to_firestore.py
"""

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

SERVER = r"localhost\SQLEXPRESS"
DATABASE = "_bak_import_temp"
BATCH_SIZE = 400

# ── Helpers ──────────────────────────────────────────────────────────────────

def json_safe(val):
    if val is None:
        return None
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    if isinstance(val, Decimal):
        return float(val)
    if isinstance(val, bytes):
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


def connect_sql():
    drivers = [d for d in pyodbc.drivers() if "SQL Server" in d]
    if not drivers:
        sys.exit("No SQL Server ODBC driver found.")
    driver = drivers[0]
    conn_str = (
        f"DRIVER={{{driver}}};"
        f"SERVER={SERVER};"
        f"DATABASE={DATABASE};"
        f"Trusted_Connection=yes;"
        f"Connection Timeout=30;"
    )
    return pyodbc.connect(conn_str, autocommit=True)


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


def upload_batch(db, collection_name, records, id_field):
    total = len(records)
    uploaded = 0
    for i in range(0, total, BATCH_SIZE):
        batch = db.batch()
        chunk = records[i : i + BATCH_SIZE]
        for rec in chunk:
            doc_id = str(rec.get(id_field, "")).strip()
            if not doc_id:
                continue
            ref = db.collection(collection_name).document(doc_id)
            batch.set(ref, rec)
        batch.commit()
        uploaded += len(chunk)
        print(f"  {collection_name}: {uploaded}/{total}")
    return uploaded


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("Connecting to SQL Server...")
    conn = connect_sql()
    cursor = conn.cursor()

    # ── Extract joined staff data ──
    print("Extracting staff data...")
    cursor.execute("""
        SELECT
            s.Staff_Number,
            s.Enrollment_Date,
            s.StaffBarcode,
            s.StaffUserName,
            s.StaffMinistryNumber,
            p.A_First_Name, p.E_First_Name,
            p.A_Father_Name, p.E_Father_Name,
            p.A_Family_Name, p.E_Family_Name,
            p.A_Grand_Father_Name, p.E_Grand_Father_Name,
            p.E_Mail,
            p.Sex,
            p.Birth_Date,
            p.Primary_Nationality,
            p.Religion,
            p.Marital_Status,
            p.ID_Number,
            c.Employee_Group_ID,
            c.School_Code,
            c.Branch_Code,
            c.Position_Code,
            c.Contract_Type,
            c.Termination_Date,
            c.Termination_Reason_Code
        FROM tblStaff s
        JOIN tblStaffPersons p ON s.Staff_Number = p.StaffPersonId
        LEFT JOIN tblStaffContracts c ON s.Staff_Number = c.Staff_Number
    """)
    columns = [col[0] for col in cursor.description]
    staff_records = []
    for row in cursor.fetchall():
        rec = {}
        for col, val in zip(columns, row):
            rec[col] = json_safe(val)
        # Build full name fields
        a_parts = [rec.get("A_First_Name"), rec.get("A_Father_Name"), rec.get("A_Family_Name")]
        e_parts = [rec.get("E_First_Name"), rec.get("E_Father_Name"), rec.get("E_Family_Name")]
        rec["A_Full_Name"] = " ".join(p for p in a_parts if p)
        rec["E_Full_Name"] = " ".join(p for p in e_parts if p)
        # Determine active status
        rec["is_active"] = rec.get("Termination_Date") is None
        staff_records.append(rec)
    print(f"  Found {len(staff_records)} staff records")

    # ── Extract departments ──
    print("Extracting departments...")
    cursor.execute("SELECT Department_Code, A_Department_Desc, E_Department_Desc FROM Department")
    columns = [col[0] for col in cursor.description]
    dept_records = []
    for row in cursor.fetchall():
        rec = {}
        for col, val in zip(columns, row):
            rec[col] = json_safe(val)
        dept_records.append(rec)
    print(f"  Found {len(dept_records)} departments")

    cursor.close()
    conn.close()

    # ── Upload to Firestore ──
    print("Initializing Firebase...")
    db = init_firebase()

    print("Uploading staff...")
    uploaded_staff = upload_batch(db, "staff", staff_records, "Staff_Number")
    print(f"  ✓ Uploaded {uploaded_staff} staff records")

    print("Uploading departments...")
    uploaded_depts = upload_batch(db, "departments", dept_records, "Department_Code")
    print(f"  ✓ Uploaded {uploaded_depts} departments")

    print("\nDone!")


if __name__ == "__main__":
    main()

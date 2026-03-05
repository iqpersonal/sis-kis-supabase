"""
Upload missing tables (especially Academic_Year) from restored .bak to Firestore.
"""
import os
import sys
from datetime import date, datetime
from decimal import Decimal

try:
    import pyodbc
except ImportError:
    sys.exit("pyodbc required")

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    sys.exit("firebase-admin required")

BAK_PATH = r"C:\temp\khaled-sisnet-ITdept_backup_2026_03_04.bak"
SERVER = r"localhost\SQLEXPRESS"
TEMP_DB = "_bak_import_temp"
BATCH_SIZE = 400

# Tables to upload that are currently missing
TABLES_TO_UPLOAD = {
    "Academic_Year":        "academic_years",
    "Charge_Type":          "charge_types",
    "Nationality":          "nationalities",
    "Student_Charges":      "student_charges",
    "Student_Invoice":      "student_invoices",
    "Student_Installments": "student_installments",
    "Student_Discount":     "student_discounts",
    "Student_Absence":      "student_absence",
    "Student_Exam_Results": "student_exam_results",
    "Student_Tardy":        "student_tardy",
    "Section":              "sections",
    "Section_Avg":          "section_averages",
    "Class":                "classes",
    "Class_Subjects":       "class_subjects",
    "Subject":              "subjects",
    "Employee":             "employees",
    "Exams":                "exams",
    "Branch":               "branches",
    "School":               "schools",
}

KEY_PATH = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")


def json_safe(val):
    if isinstance(val, Decimal):
        return float(val)
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    if isinstance(val, bytes):
        return val.hex()
    return val


def restore_db(cursor):
    cursor.execute(f"SELECT DB_ID('{TEMP_DB}')")
    if cursor.fetchone()[0] is not None:
        print(f"Database {TEMP_DB} already exists, skipping restore.")
        return

    cursor.execute(f"RESTORE FILELISTONLY FROM DISK = '{BAK_PATH}'")
    files = cursor.fetchall()

    cursor.execute("SELECT SERVERPROPERTY('InstanceDefaultDataPath')")
    data_path = cursor.fetchone()[0]

    moves = []
    for i, row in enumerate(files):
        lname = row[0]
        orig = row[2]
        ext = os.path.splitext(orig)[1]
        moves.append(f"MOVE '{lname}' TO '{data_path}{TEMP_DB}_{i}{ext}'")

    move_str = ", ".join(moves)
    sql = f"RESTORE DATABASE [{TEMP_DB}] FROM DISK = '{BAK_PATH}' WITH {move_str}, REPLACE"
    print("Restoring database...")
    cursor.execute(sql)
    while cursor.nextset():
        pass
    print("Database restored.")


def extract_and_upload(cursor, db_fs):
    cursor.execute(f"USE [{TEMP_DB}]")
    for sql_table, fs_collection in TABLES_TO_UPLOAD.items():
        try:
            cursor.execute(f"SELECT COUNT(*) FROM [{sql_table}]")
            count = cursor.fetchone()[0]
            print(f"\n{sql_table} -> {fs_collection}: {count} rows")

            if count == 0:
                continue

            cursor.execute(f"SELECT * FROM [{sql_table}]")
            cols = [c[0] for c in cursor.description]

            batch = db_fs.batch()
            batch_count = 0
            total = 0
            coll_ref = db_fs.collection(fs_collection)

            for row in cursor:
                doc = {cols[i]: json_safe(row[i]) for i in range(len(cols))}
                batch.set(coll_ref.document(), doc)
                batch_count += 1
                total += 1

                if batch_count >= BATCH_SIZE:
                    batch.commit()
                    batch = db_fs.batch()
                    batch_count = 0
                    if total % 2000 == 0:
                        print(f"  {total}/{count}...")

            if batch_count > 0:
                batch.commit()

            print(f"  Uploaded {total} docs to '{fs_collection}'")
        except Exception as e:
            print(f"  ERROR on {sql_table}: {e}")


def main():
    # Connect to SQL Server
    conn = pyodbc.connect(
        f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={SERVER};Trusted_Connection=yes",
        autocommit=True,
    )
    cursor = conn.cursor()

    # Restore .bak
    restore_db(cursor)

    # Init Firebase
    if not firebase_admin._apps:
        cred = credentials.Certificate(KEY_PATH)
        firebase_admin.initialize_app(cred)
    db_fs = firestore.client()

    # Extract and upload
    extract_and_upload(cursor, db_fs)

    # Cleanup
    cursor.execute("USE [master]")
    cursor.close()
    conn.close()
    print("\nDone! All missing tables uploaded.")


if __name__ == "__main__":
    main()

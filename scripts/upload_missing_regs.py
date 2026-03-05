"""
Upload missing registrations (23-24, 24-25, 25-26, 26-27) from SQL Server to Firestore.
Also re-upload students to ensure all are present.
"""
import os
import sys
from datetime import date, datetime
from decimal import Decimal

import pyodbc
import firebase_admin
from firebase_admin import credentials, firestore

SERVER = r"localhost\SQLEXPRESS"
DB = "_bak_import_temp"
BATCH_SIZE = 400
KEY_PATH = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")


def json_safe(val):
    if isinstance(val, Decimal):
        return float(val)
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    if isinstance(val, bytes):
        return val.hex()
    return val


def upload_table(cursor, db_fs, sql_query, fs_collection, label):
    cursor.execute(sql_query)
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
                print(f"  {label}: {total}...")

    if batch_count > 0:
        batch.commit()
    print(f"  {label}: uploaded {total} docs to '{fs_collection}'")


def main():
    conn = pyodbc.connect(
        f"DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={SERVER};"
        f"DATABASE={DB};Trusted_Connection=yes"
    )
    cursor = conn.cursor()

    if not firebase_admin._apps:
        cred = credentials.Certificate(KEY_PATH)
        firebase_admin.initialize_app(cred)
    db_fs = firestore.client()

    # 1) Upload missing registrations (years 23-24 through 26-27)
    print("Uploading missing registrations...")
    upload_table(
        cursor, db_fs,
        "SELECT * FROM Registration WHERE Academic_Year IN ('23-24','24-25','25-26','26-27')",
        "registrations",
        "Missing Registrations"
    )

    # 2) Check if all students are in Firestore
    cursor.execute("SELECT COUNT(*) FROM Student")
    sql_count = cursor.fetchone()[0]

    from google.cloud.firestore_v1.aggregation import AggregationQuery
    fs_count_result = db_fs.collection("students").count().get()
    fs_count = fs_count_result[0][0].value
    print(f"\nStudents: SQL={sql_count}, Firestore={fs_count}")

    if fs_count < sql_count:
        # Get existing student numbers from Firestore
        print("Checking for missing students...")
        existing = set()
        last_doc = None
        while True:
            q = db_fs.collection("students").order_by("__name__").limit(10000)
            if last_doc:
                q = q.start_after(last_doc)
            docs = q.get()
            if not docs:
                break
            for d in docs:
                sn = d.to_dict().get("Student_Number")
                if sn:
                    existing.add(str(sn))
            last_doc = docs[-1]

        print(f"  {len(existing)} students already in Firestore")

        # Get all from SQL and upload missing ones
        cursor.execute("SELECT * FROM Student")
        cols = [c[0] for c in cursor.description]
        sn_idx = cols.index("Student_Number")

        batch = db_fs.batch()
        batch_count = 0
        uploaded = 0
        coll_ref = db_fs.collection("students")

        for row in cursor:
            sn = str(json_safe(row[sn_idx]))
            if sn in existing:
                continue
            doc = {cols[i]: json_safe(row[i]) for i in range(len(cols))}
            batch.set(coll_ref.document(), doc)
            batch_count += 1
            uploaded += 1
            if batch_count >= BATCH_SIZE:
                batch.commit()
                batch = db_fs.batch()
                batch_count = 0
                if uploaded % 1000 == 0:
                    print(f"  Missing students: {uploaded}...")

        if batch_count > 0:
            batch.commit()
        print(f"  Uploaded {uploaded} missing students")
    else:
        print("  All students already in Firestore")

    cursor.close()
    conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()

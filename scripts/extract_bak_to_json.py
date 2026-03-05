"""
extract_bak_to_json.py
──────────────────────
Restores a SQL Server .bak file to a temporary database, reads every
user-table, and writes the combined output to data.json.

Prerequisites
─────────────
  pip install pyodbc

Usage
─────
  python extract_bak_to_json.py \
      --bak  "C:/path/to/backup.bak" \
      --server "localhost\\SQLEXPRESS" \
      --out  data.json

The script will:
  1. Connect to the SQL Server instance.
  2. Restore the .bak into a temp database (_bak_import_temp).
  3. Iterate every user table and collect rows.
  4. Write a JSON file:  { "tableName": [ {row}, … ], … }
  5. Drop the temp database on exit.

If you already have a live database (no .bak), use --db instead of --bak:
  python extract_bak_to_json.py --db MyDatabase --server localhost --out data.json
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
    sys.exit("pyodbc is required.  Install it with:  pip install pyodbc")


# ── Helpers ──────────────────────────────────────────────────────────────────

TEMP_DB = "_bak_import_temp"


def json_serial(obj):
    """JSON serializer for types not serializable by default."""
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, bytes):
        return obj.hex()
    raise TypeError(f"Type {type(obj)} not serializable")


def connect(server: str, database: str = "master", timeout: int = 30):
    """Return a pyodbc connection using Windows or SQL auth."""
    drivers = [d for d in pyodbc.drivers() if "SQL Server" in d]
    if not drivers:
        sys.exit("No SQL Server ODBC driver found. Install one from Microsoft.")
    driver = drivers[0]
    conn_str = (
        f"DRIVER={{{driver}}};"
        f"SERVER={server};"
        f"DATABASE={database};"
        f"Trusted_Connection=yes;"
        f"Connection Timeout={timeout};"
    )
    return pyodbc.connect(conn_str, autocommit=True)


def restore_bak(conn, bak_path: str):
    """Restore the .bak into TEMP_DB (replace if exists)."""
    cursor = conn.cursor()

    # Get logical file names from the backup
    cursor.execute(f"RESTORE FILELISTONLY FROM DISK = N'{bak_path}'")
    files = cursor.fetchall()

    data_file = None
    log_file = None
    for f in files:
        if str(f.Type) == "D":
            data_file = f.LogicalName
        elif str(f.Type) == "L":
            log_file = f.LogicalName

    if not data_file or not log_file:
        sys.exit("Could not determine logical file names from .bak")

    # Query SQL Server for its default data directory
    cursor.execute(
        "SELECT SERVERPROPERTY('InstanceDefaultDataPath') AS DataPath, "
        "SERVERPROPERTY('InstanceDefaultLogPath') AS LogPath"
    )
    row = cursor.fetchone()
    if row and row.DataPath:
        data_dir = row.DataPath.rstrip("\\")
        log_dir = (row.LogPath or row.DataPath).rstrip("\\")
    else:
        # Fallback: use the same folder as the .bak file
        data_dir = os.path.dirname(bak_path)
        log_dir = data_dir

    default_data = os.path.join(data_dir, f"{TEMP_DB}.mdf")
    default_log = os.path.join(log_dir, f"{TEMP_DB}_log.ldf")

    sql = f"""
        RESTORE DATABASE [{TEMP_DB}]
        FROM DISK = N'{bak_path}'
        WITH REPLACE,
             MOVE N'{data_file}' TO N'{default_data}',
             MOVE N'{log_file}'  TO N'{default_log}'
    """
    print(f"Restoring {bak_path} -> [{TEMP_DB}] ...")
    cursor.execute(sql)
    while cursor.nextset():
        pass
    cursor.close()
    print("Restore complete.")


def drop_temp_db(conn):
    """Drop the temporary database."""
    try:
        cursor = conn.cursor()
        cursor.execute(f"USE [master]")
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


def extract_tables(conn, database: str) -> dict:
    """Read every user table and return dict of table → list[dict]."""
    cursor = conn.cursor()
    cursor.execute(f"USE [{database}]")

    # Fetch user-table names
    cursor.execute("""
        SELECT TABLE_SCHEMA, TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_SCHEMA, TABLE_NAME
    """)
    tables = cursor.fetchall()
    print(f"Found {len(tables)} table(s).")

    result: dict = {}
    for schema, table in tables:
        fqn = f"[{schema}].[{table}]"
        print(f"  Reading {fqn} ...", end=" ")
        cursor.execute(f"SELECT * FROM {fqn}")
        columns = [col[0] for col in cursor.description]
        rows = [dict(zip(columns, row)) for row in cursor.fetchall()]
        key = f"{schema}.{table}" if schema != "dbo" else table
        result[key] = rows
        print(f"{len(rows)} rows")

    return result


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Extract SQL Server .bak (or live DB) → data.json"
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--bak", help="Path to the .bak backup file")
    group.add_argument("--db", help="Name of an existing database to read directly")
    parser.add_argument(
        "--server", default=r"localhost\SQLEXPRESS",
        help="SQL Server instance (default: localhost\\SQLEXPRESS)"
    )
    parser.add_argument(
        "--out", default="data.json",
        help="Output JSON file path (default: data.json)"
    )
    args = parser.parse_args()

    using_bak = args.bak is not None
    database = TEMP_DB if using_bak else args.db

    conn = connect(args.server)

    try:
        if using_bak:
            restore_bak(conn, os.path.abspath(args.bak))

        data = extract_tables(conn, database)

        # ── Flatten for the dashboard ────────────────────────────────────
        # If there is only one table, promote its rows to the top level so
        # downstream scripts get a simple array.  Otherwise keep the dict.
        if len(data) == 1:
            data = list(data.values())[0]

        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, default=json_serial, ensure_ascii=False)
        print(f"\nDone. Wrote {args.out}  ({os.path.getsize(args.out):,} bytes)")

    finally:
        if using_bak:
            drop_temp_db(conn)
        conn.close()


if __name__ == "__main__":
    main()

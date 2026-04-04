"""
db_config.py
------------
Shared SQL Server connection module.
Reads credentials from scripts/.env and provides connect_sql().
"""

import os
import sys
from pathlib import Path

try:
    import pyodbc
except ImportError:
    sys.exit("pyodbc is required.  Install with: pip install pyodbc")

# ── Load .env ────────────────────────────────────────────────────────────────

_ENV_PATH = Path(__file__).parent / ".env"

def _load_env():
    """Parse key=value pairs from .env file."""
    if not _ENV_PATH.exists():
        sys.exit(f".env file not found at {_ENV_PATH}\nCreate it with SQL_SERVER, SQL_DATABASE, SQL_UID, SQL_PWD.")
    with open(_ENV_PATH, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())

_load_env()

SQL_SERVER   = os.environ["SQL_SERVER"]
SQL_DATABASE = os.environ["SQL_DATABASE"]
SQL_UID      = os.environ["SQL_UID"]
SQL_PWD      = os.environ["SQL_PWD"]

# ── Connection ───────────────────────────────────────────────────────────────

def connect_sql(database: str | None = None, timeout: int = 30):
    """
    Connect to the live SQL Server using credentials from .env.
    Returns a pyodbc Connection.
    """
    db = database or SQL_DATABASE
    drivers = [d for d in pyodbc.drivers() if "SQL Server" in d]
    if not drivers:
        sys.exit("No SQL Server ODBC driver found. Install ODBC Driver 17 for SQL Server.")
    # Prefer modern ODBC Driver 17/18 over legacy "SQL Server" driver
    driver = next((d for d in drivers if "ODBC Driver" in d), drivers[0])
    conn_str = (
        f"DRIVER={{{driver}}};"
        f"SERVER={SQL_SERVER};"
        f"DATABASE={db};"
        f"UID={SQL_UID};"
        f"PWD={SQL_PWD};"
        f"Connection Timeout={timeout};"
        f"Encrypt=yes;"
        f"TrustServerCertificate=yes;"
    )
    return pyodbc.connect(conn_str, autocommit=True)

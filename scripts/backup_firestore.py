"""
Backup all Firestore collections to local JSON files.

Usage:
    python scripts/backup_firestore.py              # new backup
    python scripts/backup_firestore.py --resume DIR # resume a partial backup

Output:
    backups/YYYY-MM-DD_HHMMSS/<collection_name>.json
"""
import os, sys, json, time
from datetime import datetime

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    sys.exit("firebase-admin required: pip install firebase-admin")

KEY_PATH = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")

if not firebase_admin._apps:
    firebase_admin.initialize_app(credentials.Certificate(KEY_PATH))
db = firestore.client()

# --- Config ---
BACKUP_ROOT = os.path.join(os.path.dirname(__file__), "..", "backups")

# Resume mode: reuse existing folder, skip already-backed-up collections
if len(sys.argv) >= 3 and sys.argv[1] == "--resume":
    BACKUP_DIR = sys.argv[2]
    if not os.path.isabs(BACKUP_DIR):
        BACKUP_DIR = os.path.join(BACKUP_ROOT, BACKUP_DIR)
else:
    TIMESTAMP = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    BACKUP_DIR = os.path.join(BACKUP_ROOT, TIMESTAMP)

os.makedirs(BACKUP_DIR, exist_ok=True)


def serialize(obj):
    """Convert Firestore-specific types to JSON-safe values."""
    from google.cloud.firestore_v1 import DocumentReference
    from google.protobuf.timestamp_pb2 import Timestamp as ProtoTimestamp

    if hasattr(obj, "isoformat"):  # datetime / date
        return obj.isoformat()
    if isinstance(obj, DocumentReference):
        return obj.path
    if isinstance(obj, bytes):
        import base64
        return base64.b64encode(obj).decode()
    if isinstance(obj, ProtoTimestamp):
        return obj.ToDatetime().isoformat()
    raise TypeError(f"Cannot serialize {type(obj)}: {obj}")


def backup_collection(name, retries=3):
    """Stream all documents and write to JSON. Uses stream() to avoid timeout."""
    data = {}
    for attempt in range(retries):
        try:
            data = {}
            count = 0
            for doc in db.collection(name).stream():
                data[doc.id] = doc.to_dict()
                count += 1
                if count % 2000 == 0:
                    print(f"    ...{name}: {count:,} docs streamed so far", flush=True)
            break
        except Exception as e:
            if attempt < retries - 1:
                wait = 2 ** (attempt + 1)
                print(f"    Retry {attempt+1}/{retries} for {name} (waiting {wait}s): {e}", flush=True)
                time.sleep(wait)
            else:
                print(f"    FAILED {name} after {retries} attempts: {e}", flush=True)
                return -1

    path = os.path.join(BACKUP_DIR, f"{name}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, default=serialize, ensure_ascii=False, indent=2)

    return len(data)


# --- Discover all collections ---
print(f"Backup directory: {os.path.abspath(BACKUP_DIR)}\n")
print("Discovering collections...")

collections = sorted(c.id for c in db.collections())
print(f"Found {len(collections)} collections\n")

# Check what's already backed up
existing = {f.replace(".json", "") for f in os.listdir(BACKUP_DIR) if f.endswith(".json")}
if existing:
    print(f"Resuming — {len(existing)} collections already backed up, skipping them.\n")

total_docs = 0
failed = []
for i, coll in enumerate(collections, 1):
    if coll in existing:
        continue
    count = backup_collection(coll)
    if count < 0:
        failed.append(coll)
        continue
    total_docs += count
    print(f"  [{i}/{len(collections)}] {coll}: {count:,} documents", flush=True)

print(f"\nDone! {total_docs:,} documents backed up in this run.")
if existing:
    print(f"  + {len(existing)} collections from previous run")
if failed:
    print(f"\n  FAILED ({len(failed)}): {', '.join(failed)}")
    print(f"  Re-run with: python scripts/backup_firestore.py --resume {os.path.basename(BACKUP_DIR)}")
print(f"\nBackup location: {os.path.abspath(BACKUP_DIR)}")

"""
One-time fix: create the missing delivery note for the orphaned quick-issue
transaction on 2026-04-23 (HP 305A Toner, qty 1, issued to Iqbal Ali Mohammed).

Run from repo root:
    python scripts/_create_orphan_dn.py
"""
import os, sys
from datetime import datetime, timezone

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    sys.exit("firebase-admin required: pip install firebase-admin")

KEY_PATH = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")
if not os.path.exists(KEY_PATH):
    sys.exit(f"Service account key not found at: {KEY_PATH}")

if not firebase_admin._apps:
    firebase_admin.initialize_app(credentials.Certificate(KEY_PATH))
db = firestore.client()

DN_COLLECTION = "delivery_notes"

# ── Known details from the orphaned transaction ─────────────────
ISSUED_AT         = "2026-04-23T00:00:00.000Z"   # approximate; adjust if exact time known
STORE_TYPE        = "it"
ITEM_ID           = "CE410A"
ITEM_NAME         = "HP 305A Black Original LaserJet Toner Cartridge ~2 090 pages CE410A"
QUANTITY          = 1
RECEIVED_BY_UID   = "OVynVJAAqIaFccuoJcTOrA5YQFQ2"
RECEIVED_BY_NAME  = "Iqbal Ali Mohammed"
NOTES             = "Quick issue (retroactive DN — original DN missing due to system bug)"

# ── Compute next DN-IT-2026-XXXX number ────────────────────────
year = "2026"
pattern_start = f"DN-IT-{year}-"
pattern_end   = f"DN-IT-{year}-\uf8ff"

snap = (
    db.collection(DN_COLLECTION)
    .where("dn_number", ">=", pattern_start)
    .where("dn_number", "<=", pattern_end)
    .order_by("dn_number", direction=firestore.Query.DESCENDING)
    .limit(1)
    .get()
)

if snap:
    last_dn = snap[0].to_dict()["dn_number"]
    last_seq = int(last_dn.split("-")[-1])
    seq = last_seq + 1
else:
    seq = 1

dn_number = f"{pattern_start}{str(seq).zfill(4)}"

# ── Check it doesn't already exist ─────────────────────────────
existing = (
    db.collection(DN_COLLECTION)
    .where("dn_number", "==", dn_number)
    .limit(1)
    .get()
)
if existing:
    sys.exit(f"DN {dn_number} already exists — aborting to avoid duplicates.")

now = datetime.now(timezone.utc).isoformat()

dn_data = {
    "dn_number":          dn_number,
    "store_type":         STORE_TYPE,
    "branch":             "",
    "request_id":         None,
    "items": [
        {
            "item_id":   ITEM_ID,
            "item_name": ITEM_NAME,
            "quantity":  QUANTITY,
            "condition": "good",
            "remarks":   "",
        }
    ],
    "issued_by":          "",
    "issued_by_name":     "System (retroactive)",
    "received_by":        RECEIVED_BY_UID,
    "received_by_name":   RECEIVED_BY_NAME,
    "received_by_name_ar": "",
    "department":         "",
    "status":             "pending_acknowledgment",
    "issued_at":          ISSUED_AT,
    "acknowledged_at":    None,
    "notes":              NOTES,
    "created_at":         now,
}

ref = db.collection(DN_COLLECTION).add(dn_data)
doc_id = ref[1].id

print(f"✓ Created delivery note: {dn_number}")
print(f"  Firestore doc ID : {doc_id}")
print(f"  Item             : {ITEM_NAME}")
print(f"  Qty              : {QUANTITY}")
print(f"  Receiver         : {RECEIVED_BY_NAME}")
print(f"  Issued at        : {ISSUED_AT}")
print()
print(f"  View PDF at: /api/delivery-notes/pdf?id={doc_id}")

"""
write_sync_status.py — Write sync status to Firestore doc: system/sync_status
Usage:
  python write_sync_status.py --step data_sync --status success
  python write_sync_status.py --step summaries --status error --message "Connection failed"
  python write_sync_status.py --step daily_sync --status success  # marks whole run done
"""
import argparse, os, sys
from datetime import datetime

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:
    sys.exit("firebase-admin required")

# ── Firebase init ──
SA_PATH = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")
if not firebase_admin._apps:
    cred = credentials.Certificate(SA_PATH)
    firebase_admin.initialize_app(cred)
db = firestore.client()

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--step", required=True, choices=["data_sync", "summaries", "daily_sync"])
    p.add_argument("--status", required=True, choices=["running", "success", "error"])
    p.add_argument("--message", default="")
    args = p.parse_args()

    now = datetime.now().isoformat()
    doc_ref = db.collection("system").document("sync_status")

    update = {
        f"{args.step}.status": args.status,
        f"{args.step}.updated_at": now,
    }
    if args.message:
        update[f"{args.step}.message"] = args.message
    elif args.status == "success":
        update[f"{args.step}.message"] = ""

    # For daily_sync, also set top-level last_sync
    if args.step == "daily_sync" and args.status == "success":
        update["last_sync"] = now

    doc_ref.set(update, merge=True)
    print(f"Sync status updated: {args.step} = {args.status} at {now}")

if __name__ == "__main__":
    main()

/**
 * Audit Log — writes structured entries to the `audit_log` Firestore collection.
 * Call `logAudit()` from any server-side API route to record an action.
 */
import { adminDb } from "@/lib/firebase-admin";

export interface AuditEntry {
  /** Who performed the action (email or uid) */
  actor: string;
  /** What they did: "user.create", "transfer.approve", "fee.update", etc. */
  action: string;
  /** Human-readable summary */
  details: string;
  /** Optional – affected entity ID (student number, uid, etc.) */
  targetId?: string;
  /** Optional – affected entity type */
  targetType?: string;
  /** ISO timestamp – auto-filled */
  timestamp?: string;
  /** Request IP – auto-filled when provided */
  ip?: string;
}

/**
 * Write an audit log entry to Firestore.
 * Fast & fire-and-forget — does not throw on failure.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await adminDb.collection("audit_log").add({
      ...entry,
      timestamp: entry.timestamp || new Date().toISOString(),
    });
  } catch (err) {
    // Never block the caller — just warn
    console.warn("Audit log write failed:", err);
  }
}

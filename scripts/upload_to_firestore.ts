/**
 * upload_to_firestore.ts
 * ──────────────────────
 * Reads data.json and uploads every record into the Firestore
 * collection "reports".
 *
 * Prerequisites:
 *   npm install firebase-admin
 *
 * Usage:
 *   1. Place your Firebase service-account key at ./serviceAccountKey.json
 *      (download from Firebase Console → Project Settings → Service Accounts)
 *   2. npx ts-node upload_to_firestore.ts          # uses ./data.json
 *      — or —
 *      npx ts-node upload_to_firestore.ts path/to/data.json
 */

import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";

// ── Configuration ───────────────────────────────────────────────────────────
const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, "serviceAccountKey.json");
const COLLECTION = "reports";
const BATCH_SIZE = 500; // Firestore batch limit

// ── Initialise Firebase Admin ───────────────────────────────────────────────
if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error(
    `\n✗ Service-account key not found at:\n  ${SERVICE_ACCOUNT_PATH}\n\n` +
      "Download it from Firebase Console → Project Settings → Service Accounts.\n"
  );
  process.exit(1);
}

const serviceAccount = JSON.parse(
  fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf-8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const jsonPath = path.resolve(
    __dirname,
    process.argv[2] ?? "data.json"
  );

  if (!fs.existsSync(jsonPath)) {
    console.error(`\n✗ JSON file not found: ${jsonPath}\n`);
    process.exit(1);
  }

  const raw = fs.readFileSync(jsonPath, "utf-8");
  let records: Record<string, unknown>[];

  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) {
    records = parsed;
  } else if (typeof parsed === "object") {
    // If the JSON is { tableName: [...] }, take the first table's rows
    const firstKey = Object.keys(parsed)[0];
    records = parsed[firstKey];
  } else {
    console.error("Unexpected JSON shape – expected an array or object.");
    process.exit(1);
  }

  console.log(`Uploading ${records.length} record(s) to "${COLLECTION}" …\n`);

  // Upload in batches of BATCH_SIZE
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = records.slice(i, i + BATCH_SIZE);

    for (const record of chunk) {
      const docId =
        (record as any).id ?? (record as any).Id ?? undefined;
      const ref = docId
        ? db.collection(COLLECTION).doc(String(docId))
        : db.collection(COLLECTION).doc(); // auto-id
      batch.set(ref, record);
    }

    await batch.commit();
    console.log(
      `  ✓ Batch ${Math.floor(i / BATCH_SIZE) + 1} — ` +
        `records ${i + 1}–${Math.min(i + BATCH_SIZE, records.length)}`
    );
  }

  console.log(`\n✓ Done — ${records.length} documents in "${COLLECTION}".`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Upload failed:", err);
  process.exit(1);
});

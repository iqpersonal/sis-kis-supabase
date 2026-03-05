/**
 * Firebase Admin SDK – server-side only.
 *
 * Initialises using either:
 *   1. FIREBASE_SERVICE_ACCOUNT_KEY env var (JSON string)
 *   2. A serviceAccountKey.json in the project root
 *   3. GOOGLE_APPLICATION_CREDENTIALS file path
 */
import * as admin from "firebase-admin";
import fs from "fs";
import path from "path";

function getServiceAccount(): admin.ServiceAccount | undefined {
  // 1. Env var with inline JSON
  const envKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (envKey) {
    try {
      return JSON.parse(envKey) as admin.ServiceAccount;
    } catch {
      console.warn("FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON");
    }
  }

  // 2. File in project root
  const filePath = path.resolve(process.cwd(), "serviceAccountKey.json");
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as admin.ServiceAccount;
  }

  // 3. File in scripts/ folder
  const scriptsPath = path.resolve(process.cwd(), "..", "scripts", "serviceAccountKey.json");
  if (fs.existsSync(scriptsPath)) {
    return JSON.parse(fs.readFileSync(scriptsPath, "utf-8")) as admin.ServiceAccount;
  }

  return undefined;
}

if (!admin.apps.length) {
  const sa = getServiceAccount();
  if (sa) {
    admin.initializeApp({
      credential: admin.credential.cert(sa),
    });
  } else {
    // Falls back to GOOGLE_APPLICATION_CREDENTIALS or ADC
    admin.initializeApp();
  }
}

export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
export default admin;

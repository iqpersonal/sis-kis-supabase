/**
 * Firebase Admin SDK – server-side only.
 */
import * as admin from "firebase-admin";
import fs from "fs";
import path from "path";

function getServiceAccount(): admin.ServiceAccount | undefined {
  const envKey = process.env.SA_KEY;
  if (envKey) {
    try {
      return JSON.parse(envKey) as admin.ServiceAccount;
    } catch {
      console.warn("SA_KEY is not valid JSON");
    }
  }

  const filePath = path.resolve(process.cwd(), "serviceAccountKey.json");
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as admin.ServiceAccount;
  }

  const scriptsPath = path.resolve(process.cwd(), "..", "scripts", "serviceAccountKey.json");
  if (fs.existsSync(scriptsPath)) {
    return JSON.parse(fs.readFileSync(scriptsPath, "utf-8")) as admin.ServiceAccount;
  }

  return undefined;
}

function ensureApp(): admin.app.App {
  try {
    return admin.app();
  } catch {
    // No default app exists yet, create one
    const sa = getServiceAccount();
    if (sa) {
      return admin.initializeApp({ credential: admin.credential.cert(sa) });
    }
    return admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: "sis-kis",
    });
  }
}

const app = ensureApp();
export const adminDb = app.firestore();
export const adminAuth = app.auth();
export default admin;

import fs from "fs";
import admin from "firebase-admin";

let firestore: admin.firestore.Firestore | null = null;

export function getFirestoreIfConfigured(): admin.firestore.Firestore | null {
  if (firestore) return firestore;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const jsonInline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const jsonPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (!projectId) return null;

  let credential: admin.credential.Credential | null = null;
  if (jsonInline && jsonInline.trim()) {
    credential = admin.credential.cert(JSON.parse(jsonInline));
  } else if (jsonPath && jsonPath.trim()) {
    const raw = fs.readFileSync(jsonPath, "utf8");
    credential = admin.credential.cert(JSON.parse(raw));
  } else {
    // If running on Firebase/Google infra with default creds.
    credential = admin.credential.applicationDefault();
  }

  if (admin.apps.length === 0) {
    admin.initializeApp({ credential, projectId });
  }
  firestore = admin.firestore();
  return firestore;
}


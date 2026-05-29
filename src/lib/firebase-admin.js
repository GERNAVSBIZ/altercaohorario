import admin from "firebase-admin";

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

const isPlaceholder = !projectId || projectId.includes("PLACEHOLDER") || !privateKeyRaw || privateKeyRaw.includes("PLACEHOLDER");

let adminDb = null;
let adminAuth = null;

if (!isPlaceholder) {
  if (!admin.apps.length) {
    try {
      let privateKey = privateKeyRaw;
      if (privateKey) {
        // Remove surrounding quotes if they exist in the environment variable
        if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
          privateKey = privateKey.slice(1, -1);
        }
        if (privateKey.startsWith("'") && privateKey.endsWith("'")) {
          privateKey = privateKey.slice(1, -1);
        }
        privateKey = privateKey.replace(/\\n/g, "\n");
      }

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      console.log("Firebase Admin SDK initialized successfully.");
    } catch (error) {
      console.error("Firebase Admin initialization error:", error);
    }
  }

  if (admin.apps.length > 0) {
    adminDb = admin.firestore();
    adminAuth = admin.auth();
  }
} else {
  console.warn("Firebase Admin SDK: Environment variables not configured yet. Operating in fallback mode.");
}

export { admin, adminDb, adminAuth };

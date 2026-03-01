import { initializeApp, getApps, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getStorage, Storage } from "firebase-admin/storage";

let _app: App | null = null;
let _db: Firestore | null = null;
let _storage: Storage | null = null;
let _initialized = false;

/**
 * Initialize Firebase Admin SDK
 * Called automatically on first access to db or storage
 */
function ensureInitialized(): void {
  if (_initialized) {
    return;
  }

  if (getApps().length === 0) {
    _app = initializeApp();
  } else {
    _app = getApps()[0];
  }

  _db = getFirestore(_app);
  _storage = getStorage(_app);

  // Configure Firestore settings
  _db.settings({
    ignoreUndefinedProperties: true,
  });

  _initialized = true;
  console.log("Firebase Admin SDK initialized");
}

/**
 * Get Firestore instance
 */
export function getDb(): Firestore {
  ensureInitialized();
  return _db!;
}

/**
 * Get Storage instance
 */
export function getStorageBucket(): Storage {
  ensureInitialized();
  return _storage!;
}

/**
 * Convenience db object with bound methods
 */
export const db = {
  get collection() {
    return getDb().collection.bind(getDb());
  },
  get doc() {
    return getDb().doc.bind(getDb());
  },
  get batch() {
    return getDb().batch.bind(getDb());
  },
  get runTransaction() {
    return getDb().runTransaction.bind(getDb());
  },
  get collectionGroup() {
    return getDb().collectionGroup.bind(getDb());
  },
};

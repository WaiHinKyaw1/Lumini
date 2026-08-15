import { initializeApp } from 'firebase/app';
import { initializeAuth, browserLocalPersistence, getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// CRITICAL: Bind custom database id explicitly to keep client context in sync
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Initialize Firebase Auth with browserLocalPersistence to bypass potential IndexedDB iframe security assertion issues
let firebaseAuth;
try {
  firebaseAuth = initializeAuth(app, {
    persistence: browserLocalPersistence,
  });
} catch (e) {
  firebaseAuth = getAuth(app);
}

export const auth = firebaseAuth;

// Verification helper following constraints in SKILL.md
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Please check your Firebase configuration or network.");
    }
  }
}

// Operational enumeration
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

// Error metadata
export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

// Catch and translate Firestore operation errors
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorCode = (error as { code?: string })?.code || '';

  // Intercept offline or network connection issues to avoid triggering unhandled fatal crashed rejections
  const isOfflineError = 
    errorCode === 'unavailable' || 
    errorMessage.toLowerCase().includes('offline') || 
    errorMessage.toLowerCase().includes('could not reach') || 
    errorMessage.toLowerCase().includes('failed to get document because the client is offline');

  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };

  if (isOfflineError) {
    console.warn('Firestore is currently operating in offline/disconnected mode: ', JSON.stringify(errInfo));
    // Gracefully return here instead of crashing the front-end stream
    return;
  }

  console.error('Firestore Error Details: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Shared Firestore operations — deduplicates the repeated
 * "doc ref → updateDoc → catch handleFirestoreError" pattern
 * that previously lived in App.tsx (spendCredits / addCredits / refuel sync).
 *
 * Only writes when a user is authenticated. Offline errors are
 * handled gracefully by the existing `handleFirestoreError` logic.
 */

import { auth, db, OperationType, handleFirestoreError } from './firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import type { FirestoreUserDoc } from '../types';

export const USERS_COLLECTION = 'users';

/** Build a typed reference to the current user's Firestore document */
export const getUserDocRef = () => {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  return doc(db, USERS_COLLECTION, uid);
};

/**
 * Persist a partial stats patch to the user doc, with the shared
 * offline-tolerant error handler. No-op if logged out.
 */
export const updateUserDoc = (patch: Partial<FirestoreUserDoc>): void => {
  const ref = getUserDocRef();
  if (!ref) return;
  updateDoc(ref, { ...patch, updatedAt: serverTimestamp() }).catch((error) => {
    handleFirestoreError(error, OperationType.UPDATE, `${USERS_COLLECTION}/${auth.currentUser?.uid}`);
  });
};



/**
 * Deduct credits and increment the generation counter (used when a
 * module task starts). Returns `null` when the balance is insufficient.
 */
export const spendCreditsOp = (currentCredits: number, currentTotal: number, amount: number) => {
  if (currentCredits < amount) return null;
  const newCredits = currentCredits - amount;
  const newTotal = currentTotal + 1;
  updateUserDoc({ credits: newCredits, totalGenerated: newTotal });
  return { credits: newCredits, totalGenerated: newTotal };
};

/** Add free credits (daily check-in, missions, referrals) */
export const addCreditsOp = (currentCredits: number, amount: number) => {
  const newCredits = currentCredits + amount;
  updateUserDoc({ credits: newCredits });
  return { credits: newCredits };
};

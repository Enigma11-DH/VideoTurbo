import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

import firebaseConfig from '../firebase-applet-config.json';

const isConfigValid = firebaseConfig.apiKey && firebaseConfig.apiKey !== "TODO_KEYHERE";

export const app = isConfigValid ? initializeApp(firebaseConfig) : null;
export const db = isConfigValid ? getFirestore(app, firebaseConfig.firestoreDatabaseId) : null;
export const auth = isConfigValid ? getAuth(app) : null;
export const googleProvider = isConfigValid ? new GoogleAuthProvider() : null;

export const signInWithGoogle = async () => {
  if (!auth || !googleProvider) {
    console.error("Firebase is not configured.");
    return null;
  }
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};

export const logout = async () => {
  if (!auth) return;
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
    throw error;
  }
};

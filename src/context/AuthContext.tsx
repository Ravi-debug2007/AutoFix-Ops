import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, googleProvider, validateFirestoreConnection } from '../lib/firebase';
import { Settings } from '../types';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  isSigningIn: boolean;
  isAllowed: boolean;
  signIn: () => Promise<void>;
  logOut: () => Promise<void>;
  authError: string | null;
  clearAuthError: () => void;
  settings: Settings | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    // Validate Firestore connectivity on app boot
    validateFirestoreConnection().catch(console.error);

    // 1. Listen to global settings for operator allowlist
    const unsubSettings = onSnapshot(
      doc(db, 'settings', 'global'),
      (snap) => {
        if (snap.exists()) {
          setSettings(snap.data() as Settings);
        }
      },
      (err) => console.warn('Settings listener error:', err)
    );

    // 2. Listen to Firebase auth state
    const unsubAuth = onAuthStateChanged(
      auth,
      (user) => {
        setCurrentUser(user);
        setLoading(false);
      },
      (err) => {
        console.error('Auth state error:', err);
        setLoading(false);
      }
    );

    return () => {
      unsubSettings();
      unsubAuth();
    };
  }, []);

  // Compute allowed operator status
  const defaultAllowlist = ['allampallyravikiran2007@gmail.com'];
  const configuredList =
    settings?.authAllowlist && settings.authAllowlist.length > 0
      ? settings.authAllowlist
      : defaultAllowlist;

  const isAllowed = Boolean(
    currentUser?.email &&
      configuredList.some(
        (email) => email.trim().toLowerCase() === currentUser.email?.trim().toLowerCase()
      )
  );

  const clearAuthError = () => {
    setAuthError(null);
  };

  const signIn = async () => {
    // Prevent duplicate concurrent popup requests which trigger auth/cancelled-popup-request
    if (isSigningIn) {
      console.warn('Sign-in is already in progress.');
      return;
    }

    setIsSigningIn(true);
    setAuthError(null);

    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      console.warn('Sign-in error caught:', err);
      const firebaseError = err as { code?: string; message?: string };
      const code = firebaseError?.code || '';

      if (code === 'auth/cancelled-popup-request') {
        // A popup request was superseded or cancelled by a concurrent attempt
        setAuthError('Sign-in popup was cancelled or interrupted. Please click "Sign in with Google" once to try again.');
      } else if (code === 'auth/popup-closed-by-user') {
        setAuthError('The sign-in window was closed before completing. Please try again.');
      } else if (code === 'auth/popup-blocked') {
        setAuthError('The sign-in popup was blocked by your browser. Please allow popups for this site or open in a new tab.');
      } else if (code === 'auth/network-request-failed') {
        setAuthError('Network error connecting to Google Auth service. Please check your internet connection.');
      } else if (code === 'auth/unauthorized-domain') {
        setAuthError('Domain is not authorized in Firebase Console Authentication settings.');
      } else {
        setAuthError(
          firebaseError?.message ||
            (err instanceof Error ? err.message : 'Google sign-in could not be completed.')
        );
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const logOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Sign-out error:', err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        loading,
        isSigningIn,
        isAllowed,
        signIn,
        logOut,
        authError,
        clearAuthError,
        settings,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

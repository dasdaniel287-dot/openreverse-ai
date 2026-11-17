import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleProvider, testFirestoreConnection } from '../services/firebase';
import { ensureUserProfileAndSettings, updateUserSettings } from '../services/firestoreService';
import type { UserProfile, UserSettingsRecord } from '../types';
import { useTheme } from './ThemeContext';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  settings: UserSettingsRecord | null;
  loading: boolean;
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfileSettings: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<UserSettingsRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const { setTheme } = useTheme();

  useEffect(() => {
    void testFirestoreConnection();
  }, []);

  const syncUser = async (firebaseUser: User) => {
    const res = await ensureUserProfileAndSettings({
      uid: firebaseUser.uid,
      displayName: firebaseUser.displayName ?? firebaseUser.email?.split('@')[0] ?? 'Analyst',
      email: firebaseUser.email ?? '',
      photoURL: firebaseUser.photoURL,
    });
    setProfile(res.profile);
    setSettings(res.settings);
    if (res.settings.theme === 'light' || res.settings.theme === 'dark') {
      setTheme(res.settings.theme);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthError(null);
      if (firebaseUser) {
        try {
          await syncUser(firebaseUser);
        } catch (err) {
          setAuthError(err instanceof Error ? err.message : 'Failed to initialize user workspace.');
        }
      } else {
        setProfile(null);
        setSettings(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
      setAuthError(msg);
      throw err;
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const refreshProfileSettings = async () => {
    if (!auth.currentUser) return;
    await syncUser(auth.currentUser);
  };

  // Keep theme preference persisted when user changes it while authenticated
  const { theme } = useTheme();
  useEffect(() => {
    if (user && settings && settings.theme !== theme) {
      void updateUserSettings(user.uid, { theme }).then(() => {
        setSettings((prev) => (prev ? { ...prev, theme } : prev));
      }).catch(() => {
        // non-blocking
      });
    }
  }, [theme, user?.uid]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        settings,
        loading,
        authError,
        signInWithGoogle,
        logout,
        refreshProfileSettings,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

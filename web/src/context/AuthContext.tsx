import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  auth,
  hasRealFirebaseConfig,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup
} from '../lib/firebase';
import { api, setAuthTokenGetter, ApiError } from '../lib/api';
import { User, Shop, ShopVerification, RegisterShopPayload } from '@yorbalance/shared';

interface AuthContextType {
  user: User | null;
  shop: Shop | null;
  latestVerification: ShopVerification | null;
  loading: boolean;
  isAdmin: boolean;
  isApproved: boolean;
  isPending: boolean;
  isRejected: boolean;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginAsAdmin: (email: string, pass: string) => Promise<void>;
  registerShop: (email: string, pass: string, shopPayload: Omit<RegisterShopPayload, 'email'>) => Promise<void>;
  sendResetEmail: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Local storage keys for mock/dev session persistence
const DEV_SESSION_KEY = 'yorbalance_dev_session';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [latestVerification, setLatestVerification] = useState<ShopVerification | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Token retrieval function for API requests
  const getToken = useCallback(async (): Promise<string | null> => {
    if (hasRealFirebaseConfig && auth?.currentUser) {
      return await auth.currentUser.getIdToken();
    }
    const saved = localStorage.getItem(DEV_SESSION_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.role === 'ADMIN') return 'dev-admin';
        return `dev-owner-${parsed.email}`;
      } catch {
        return null;
      }
    }
    return null;
  }, []);

  useEffect(() => {
    setAuthTokenGetter(getToken);
  }, [getToken]);

  const refreshSession = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) {
        setUser(null);
        setShop(null);
        setLatestVerification(null);
        setLoading(false);
        return;
      }
      const data = await api.getMe();
      setUser(data.user);
      setShop(data.shop);
      setLatestVerification(data.latest_verification || null);
    } catch (err: any) {
      // If unauthorized or stale dev token, clear localStorage session
      if (err?.status === 401 || err?.code === 'UNAUTHORIZED') {
        localStorage.removeItem(DEV_SESSION_KEY);
      }
      setUser(null);
      setShop(null);
      setLatestVerification(null);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  // Listen to Firebase Auth or restore dev session
  useEffect(() => {
    if (hasRealFirebaseConfig && auth) {
      const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
        if (firebaseUser) {
          await refreshSession();
        } else {
          setUser(null);
          setShop(null);
          setLatestVerification(null);
          setLoading(false);
        }
      });
      return () => unsubscribe();
    } else {
      // Dev mode: check localStorage
      const saved = localStorage.getItem(DEV_SESSION_KEY);
      if (saved) {
        refreshSession();
      } else {
        setLoading(false);
      }
    }
  }, [refreshSession]);

  const loginWithEmail = async (email: string, pass: string) => {
    setLoading(true);
    try {
      if (hasRealFirebaseConfig && auth) {
        await signInWithEmailAndPassword(auth, email, pass);
        await refreshSession();
      } else {
        // Dev fallback mode
        localStorage.setItem(DEV_SESSION_KEY, JSON.stringify({ email, role: 'OWNER' }));
        await refreshSession();
      }
    } finally {
      setLoading(false);
    }
  };

  const loginAsAdmin = async (email: string, pass: string) => {
    setLoading(true);
    const cleanEmail = email.trim().toLowerCase();
    try {
      const isConfiguredAdmin =
        (cleanEmail === 'muzamilmohammadk@gmail.com' && pass === 'GHI#agh%(^') ||
        (cleanEmail === 'admin@yorbalance.com' && pass === 'admin123');

      if (hasRealFirebaseConfig && auth) {
        try {
          await signInWithEmailAndPassword(auth, email, pass);
          await refreshSession();
          return;
        } catch (firebaseErr: any) {
          // If the password matches the admin credentials configured by user, authenticate as Admin
          if (isConfiguredAdmin) {
            localStorage.setItem(DEV_SESSION_KEY, JSON.stringify({ email: cleanEmail, role: 'ADMIN' }));
            await refreshSession();
            return;
          }
          throw firebaseErr;
        }
      } else {
        if (isConfiguredAdmin) {
          localStorage.setItem(DEV_SESSION_KEY, JSON.stringify({ email: cleanEmail, role: 'ADMIN' }));
          await refreshSession();
        } else {
          throw new Error('Invalid Administrator credentials.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const loginWithGoogle = async () => {
    setLoading(true);
    try {
      if (hasRealFirebaseConfig && auth) {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
        await refreshSession();
      } else {
        // Dev mode simulation
        const mockEmail = 'demo.merchant@gmail.com';
        localStorage.setItem(DEV_SESSION_KEY, JSON.stringify({ email: mockEmail, role: 'OWNER' }));
        await refreshSession();
      }
    } finally {
      setLoading(false);
    }
  };

  const registerShop = async (
    email: string,
    pass: string,
    shopPayload: Omit<RegisterShopPayload, 'email'>
  ) => {
    setLoading(true);
    try {
      let uid = 'dev-uid-' + Date.now();
      if (hasRealFirebaseConfig && auth) {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        uid = cred.user.uid;
      } else {
        localStorage.setItem(DEV_SESSION_KEY, JSON.stringify({ email, role: 'OWNER', uid }));
      }

      // Call API to create Shop and User records in database
      const fullPayload: RegisterShopPayload = {
        ...shopPayload,
        email
      };

      const res = await api.registerShop(fullPayload);
      setUser(res.user);
      setShop(res.shop);
      setLatestVerification(null);
    } finally {
      setLoading(false);
    }
  };

  const sendResetEmail = async (email: string) => {
    if (hasRealFirebaseConfig && auth) {
      await sendPasswordResetEmail(auth, email);
    } else {
      // Simulate successful email dispatch
      await new Promise(r => setTimeout(r, 600));
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      if (hasRealFirebaseConfig && auth) {
        await signOut(auth);
      }
      localStorage.removeItem(DEV_SESSION_KEY);
      setUser(null);
      setShop(null);
      setLatestVerification(null);
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = user?.role === 'ADMIN';
  const isApproved = shop?.status === 'APPROVED';
  const isPending = shop?.status === 'PENDING';
  const isRejected = shop?.status === 'REJECTED';

  return (
    <AuthContext.Provider
      value={{
        user,
        shop,
        latestVerification,
        loading,
        isAdmin,
        isApproved,
        isPending,
        isRejected,
        loginWithEmail,
        loginWithGoogle,
        loginAsAdmin,
        registerShop,
        sendResetEmail,
        logout,
        refreshSession
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};


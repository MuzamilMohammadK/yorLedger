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
      if (!token && !auth?.currentUser) {
        setUser(null);
        setShop(null);
        setLatestVerification(null);
        setLoading(false);
        return;
      }

      let isAdminClaim = false;
      if (auth?.currentUser) {
        try {
          const tokenResult = await auth.currentUser.getIdTokenResult();
          isAdminClaim = !!tokenResult.claims.admin || auth.currentUser.email?.toLowerCase() === 'muzamilmohammadk@gmail.com';
        } catch {}
      }

      try {
        const data = await api.getMe();
        if (data && data.user) {
          if (isAdminClaim) {
            data.user.role = 'ADMIN';
          }
          setUser(data.user);
          setShop(data.shop);
          setLatestVerification(data.latest_verification || null);
          return;
        }
      } catch (apiErr: any) {
        console.warn('API getMe error, using auth token session fallback:', apiErr);
      }

      if (auth?.currentUser) {
        setUser({
          id: auth.currentUser.uid,
          shop_id: null,
          firebase_uid: auth.currentUser.uid,
          email: auth.currentUser.email || '',
          role: isAdminClaim ? 'ADMIN' : 'OWNER',
          created_at: auth.currentUser.metadata.creationTime || new Date().toISOString()
        });
        return;
      }

      const saved = localStorage.getItem(DEV_SESSION_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setUser({
            id: parsed.uid || 'dev-id',
            shop_id: parsed.shop_id || null,
            firebase_uid: parsed.uid || 'dev-id',
            email: parsed.email,
            role: parsed.role,
            created_at: new Date().toISOString()
          });
          return;
        } catch {}
      }

      setUser(null);
      setShop(null);
      setLatestVerification(null);
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
          const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
          const idToken = await cred.user.getIdTokenResult();
          const isAdminUser = !!idToken.claims.admin || cleanEmail === 'muzamilmohammadk@gmail.com';
          if (!isAdminUser && !isConfiguredAdmin) {
            await signOut(auth);
            throw new Error('Access restricted: this account does not have administrator privileges.');
          }
          localStorage.setItem(DEV_SESSION_KEY, JSON.stringify({ email: cleanEmail, role: 'ADMIN', uid: cred.user.uid }));
          await refreshSession();
          return;
        } catch (firebaseErr: any) {
          // If the password matches the administrator credentials configured by user, authenticate as Admin
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
      if (res.shop?.id) {
        try {
          localStorage.setItem('yorbalance_active_shop_id', res.shop.id);
        } catch {}
      }
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


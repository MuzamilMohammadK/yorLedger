import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup
} from '../lib/firebase';
import { getMe, registerShop as registerShopDoc, watchShop, latestVerification as fetchLatestVerification } from '../lib/data/session';
import { User, Shop, ShopVerification, RegisterShopPayload } from '@yorbalance/shared';
import { setActiveShop } from '../lib/api';

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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [latestVerification, setLatestVerification] = useState<ShopVerification | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const shopWatch = useRef<(() => void) | null>(null);

  // Keep the data layer pointed at the signed-in user's own shop.
  useEffect(() => {
    setActiveShop(shop);
  }, [shop]);

  const clear = () => {
    shopWatch.current?.();
    shopWatch.current = null;
    setUser(null);
    setShop(null);
    setLatestVerification(null);
  };

  const refreshSession = useCallback(async () => {
    try {
      const me = await getMe();
      if (!me) {
        // Signed in to Firebase but no shop registered yet (e.g. first Google sign-in).
        shopWatch.current?.();
        shopWatch.current = null;
        setUser(auth.currentUser ? {
          id: auth.currentUser.uid, firebase_uid: auth.currentUser.uid, shop_id: null,
          email: auth.currentUser.email ?? '', role: 'OWNER',
          created_at: auth.currentUser.metadata.creationTime ?? new Date().toISOString()
        } : null);
        setShop(null);
        setLatestVerification(null);
        return;
      }
      setUser(me.user);
      setShop(me.shop);
      setLatestVerification(me.latest_verification ?? null);
      // Live status: approval/rejection by the admin shows up immediately.
      shopWatch.current?.();
      shopWatch.current = me.shop
        ? watchShop(me.shop.id, async s => {
            setShop(s);
            if (s) setLatestVerification(await fetchLatestVerification(s.id));
          })
        : null;
    } catch (err) {
      console.error('Session refresh failed:', err);
      clear();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async fbUser => {
      if (fbUser) {
        await refreshSession();
      } else {
        clear();
        setLoading(false);
      }
    });
    return () => {
      unsub();
      shopWatch.current?.();
    };
  }, [refreshSession]);

  const withLoading = async (fn: () => Promise<void>) => {
    setLoading(true);
    try {
      await fn();
    } finally {
      setLoading(false);
    }
  };

  const loginWithEmail = (email: string, pass: string) =>
    withLoading(async () => {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
      await refreshSession();
    });

  // Admin access is decided only by the `admin` custom claim (scripts/set-admin.mjs).
  const loginAsAdmin = (email: string, pass: string) =>
    withLoading(async () => {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
      const token = await cred.user.getIdTokenResult(true);
      if (token.claims.admin !== true) {
        await signOut(auth);
        throw new Error('This account does not have administrator access.');
      }
      await refreshSession();
    });

  const loginWithGoogle = () =>
    withLoading(async () => {
      await signInWithPopup(auth, new GoogleAuthProvider());
      await refreshSession();
    });

  const registerShop = (email: string, pass: string, shopPayload: Omit<RegisterShopPayload, 'email'>) =>
    withLoading(async () => {
      // A Google-signed-in user registering a shop already has a Firebase account.
      if (!auth.currentUser) {
        await createUserWithEmailAndPassword(auth, email.trim(), pass);
      }
      await registerShopDoc({ ...shopPayload, email: auth.currentUser?.email ?? email });
      await refreshSession();
    });

  const sendResetEmail = async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  };

  const logout = () =>
    withLoading(async () => {
      await signOut(auth);
      clear();
    });

  return (
    <AuthContext.Provider
      value={{
        user,
        shop,
        latestVerification,
        loading,
        isAdmin: user?.role === 'ADMIN',
        isApproved: shop?.status === 'APPROVED',
        isPending: shop?.status === 'PENDING',
        isRejected: shop?.status === 'REJECTED',
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

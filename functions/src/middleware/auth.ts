import { Request, Response, NextFunction } from 'express';
import admin from 'firebase-admin';
import { getDatabase } from '../db/index.js';
import { User, Shop } from '@yorbalance/shared';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: User;
      shop?: Shop | null;
      firebaseUid?: string;
    }
  }
}

let firebaseInitialized = false;

export function initializeFirebaseAdmin() {
  if (firebaseInitialized) return;
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      firebaseInitialized = true;
      console.log('Firebase Admin SDK initialized with service account key');
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp();
      firebaseInitialized = true;
      console.log('Firebase Admin SDK initialized with GOOGLE_APPLICATION_CREDENTIALS');
    } else {
      console.log('Firebase Admin running in mock/development mode (no service account specified)');
    }
  } catch (err) {
    console.warn('Firebase Admin SDK init notice:', err);
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const db = await getDatabase();

  // 1. Dev & test bypass header / mock token support
  if (authHeader && authHeader.startsWith('Bearer dev-')) {
    const tokenType = authHeader.replace('Bearer dev-', '');
    if (tokenType === 'admin') {
      const adminUser = await db.findUserByEmail('admin@yorbalance.com');
      if (adminUser) {
        req.user = adminUser;
        req.firebaseUid = adminUser.firebase_uid;
        return next();
      }
    } else if (tokenType.startsWith('owner-')) {
      const email = tokenType.replace('owner-', '');
      const user = await db.findUserByEmail(email);
      if (user) {
        req.user = user;
        req.firebaseUid = user.firebase_uid;
        if (user.shop_id) {
          req.shop = await db.findShopById(user.shop_id);
        }
        return next();
      }
    }
  }

  // 2. Standard Firebase ID Token Verification
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    let firebaseUid: string;
    let email: string | undefined;

    if (firebaseInitialized) {
      const decoded = await admin.auth().verifyIdToken(token);
      firebaseUid = decoded.uid;
      email = decoded.email;
    } else {
      // In dev mode without Firebase credentials, allow decoded mock token format: "uid:email"
      const parts = Buffer.from(token, 'base64').toString('utf8').split(':');
      if (parts.length === 2) {
        firebaseUid = parts[0];
        email = parts[1];
      } else {
        firebaseUid = token;
        email = undefined;
      }
    }

    req.firebaseUid = firebaseUid;
    let user = await db.findUserByFirebaseUid(firebaseUid);
    if (!user && email) {
      user = await db.findUserByEmail(email);
    }

    if (user) {
      req.user = user;
      if (user.shop_id) {
        req.shop = await db.findShopById(user.shop_id);
      }
    }

    next();
  } catch (err: any) {
    console.error('Authentication verification error:', err);
    res.status(401).json({ code: 'INVALID_TOKEN', message: 'Token verification failed', detail: err.message });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || req.user.role !== 'ADMIN') {
    res.status(403).json({ code: 'FORBIDDEN_NOT_ADMIN', message: 'Administrator access required' });
    return;
  }
  next();
}

export function requireApprovedShop(req: Request, res: Response, next: NextFunction): void {
  if (!req.shop) {
    res.status(403).json({ code: 'NO_SHOP', message: 'No registered shop associated with user' });
    return;
  }
  if (req.shop.status !== 'APPROVED') {
    res.status(403).json({
      code: 'SHOP_NOT_APPROVED',
      message: `Shop access restricted. Current status: ${req.shop.status}`,
      status: req.shop.status
    });
    return;
  }
  next();
}


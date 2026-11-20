import crypto from 'crypto';
import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const HEAD_ADMIN_EMAIL = 'amazingfunsos@gmail.com';
const VALID_ID_REGEX = /^[a-zA-Z0-9_\-]{1,128}$/;

interface FirebaseAppletConfig {
  projectId: string;
  firestoreDatabaseId?: string;
}

function loadFirebaseConfig(): FirebaseAppletConfig {
  // Allow overriding via env vars (handy on Vercel); otherwise read the JSON file.
  if (process.env.FIREBASE_PROJECT_ID) {
    return {
      projectId: process.env.FIREBASE_PROJECT_ID,
      firestoreDatabaseId: process.env.FIREBASE_DATABASE_ID || undefined,
    };
  }
  // process.cwd() is the project root locally and /var/task on Vercel
  // (the file is bundled via "includeFiles" in vercel.json).
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw) as FirebaseAppletConfig;
}

const firebaseConfig = loadFirebaseConfig();

if (
  !firebaseConfig.projectId ||
  firebaseConfig.projectId === 'remixed-project-id' ||
  firebaseConfig.firestoreDatabaseId === 'remixed-firestore-database-id'
) {
  throw new Error('Firebase has not been provisioned for this app yet.');
}

// On Google Cloud (AI Studio / Cloud Run) default credentials just work.
// On Vercel you must provide a service account via FIREBASE_SERVICE_ACCOUNT
// (the full JSON key file contents, or the same JSON base64-encoded).
function loadServiceAccount(): Record<string, unknown> | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return null;
  const jsonText = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const parsed = JSON.parse(jsonText) as Record<string, unknown>;
  if (typeof parsed.private_key === 'string') {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }
  return parsed;
}

const serviceAccount = loadServiceAccount();

const adminApp = getApps().length
  ? getApp()
  : initializeApp(
      serviceAccount
        ? {
            credential: cert(serviceAccount as Parameters<typeof cert>[0]),
            projectId: firebaseConfig.projectId,
          }
        : { projectId: firebaseConfig.projectId },
    );

const adminAuth = getAuth(adminApp);
const adminDb =
  firebaseConfig.firestoreDatabaseId &&
  firebaseConfig.firestoreDatabaseId !== '(default)'
    ? getFirestore(adminApp, firebaseConfig.firestoreDatabaseId)
    : getFirestore(adminApp);

function hashRecoveryCode(code: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(code, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyRecoveryCode(code: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  const actualBuf = crypto.scryptSync(code, salt, 64);
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

function isIamPermissionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string | number })?.code;
  return (
    code === 7 ||
    code === 'PERMISSION_DENIED' ||
    code === 'auth/insufficient-permission' ||
    msg.includes('PERMISSION_DENIED') ||
    msg.includes('insufficient-permission') ||
    msg.includes('HTTP Error 403') ||
    msg.includes('caller does not have permission')
  );
}

// Simple per-IP rate limiter for unauthenticated password reset requests
const ipAttemptMap = new Map<string, { count: number; resetAt: number }>();

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = ipAttemptMap.get(ip);
  if (!entry || entry.resetAt <= now) {
    ipAttemptMap.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 15) {
    return false;
  }
  entry.count += 1;
  return true;
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  return token || null;
}

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  // Save or update personal Recovery Code (signed-in users)
  app.post('/api/auth/set-recovery-code', async (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const rawCode = req.body?.recoveryCode;
    if (typeof rawCode !== 'string') {
      res.status(400).json({ error: 'Recovery code must be text.' });
      return;
    }
    const recoveryCode = rawCode.trim();
    if (recoveryCode.length < 4 || recoveryCode.length > 64) {
      res.status(400).json({ error: 'Recovery code must be 4 to 64 characters.' });
      return;
    }

    try {
      const decoded = await adminAuth.verifyIdToken(token);
      const codeHash = hashRecoveryCode(recoveryCode);
      await adminDb.collection('recovery_secrets').doc(decoded.uid).set({
        uid: decoded.uid,
        codeHash,
        failedAttempts: 0,
        lockedUntil: 0,
        updatedAt: FieldValue.serverTimestamp(),
      });
      res.json({ ok: true });
    } catch (err) {
      if (isIamPermissionError(err)) {
        res.status(503).json({
          code: 'iam_not_configured',
          error:
            'Server recovery storage is waiting on Firebase IAM permissions (roles/datastore.user).',
        });
        return;
      }
      console.error('set-recovery-code error:', err);
      res.status(401).json({ error: 'Could not verify session or save recovery code.' });
    }
  });

  // Check if current signed-in user has a Recovery Code saved
  app.post('/api/auth/has-recovery-code', async (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      const snap = await adminDb.collection('recovery_secrets').doc(decoded.uid).get();
      res.json({ hasRecoveryCode: snap.exists });
    } catch (err) {
      if (isIamPermissionError(err)) {
        res.status(503).json({
          code: 'iam_not_configured',
          hasRecoveryCode: false,
        });
        return;
      }
      res.status(401).json({ error: 'Invalid session.' });
    }
  });

  // Reset password WITHOUT email using Email + personal Recovery Code
  app.post('/api/auth/reset-with-recovery', async (req: Request, res: Response) => {
    const clientIp = req.ip || 'unknown';
    if (!checkIpRateLimit(clientIp)) {
      res.status(429).json({ error: 'Too many reset attempts. Please wait 15 minutes.' });
      return;
    }

    const rawEmail = req.body?.email;
    const rawCode = req.body?.recoveryCode;
    const rawPassword = req.body?.newPassword;

    if (
      typeof rawEmail !== 'string' ||
      typeof rawCode !== 'string' ||
      typeof rawPassword !== 'string'
    ) {
      res.status(400).json({ error: 'Email, recovery code, and new password are required.' });
      return;
    }

    const email = rawEmail.trim().toLowerCase();
    const recoveryCode = rawCode.trim();
    const newPassword = rawPassword;

    if (!email || !email.includes('@') || email.length > 200) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }
    if (recoveryCode.length < 4 || recoveryCode.length > 64) {
      res.status(400).json({ error: 'Invalid email or recovery code.' });
      return;
    }
    if (newPassword.length < 6 || newPassword.length > 128) {
      res.status(400).json({ error: 'New password must be 6 to 128 characters.' });
      return;
    }

    try {
      let userRecord;
      try {
        userRecord = await adminAuth.getUserByEmail(email);
      } catch (lookupErr) {
        if (isIamPermissionError(lookupErr)) throw lookupErr;
        res.status(400).json({ error: 'Invalid email or recovery code.' });
        return;
      }

      const secretRef = adminDb.collection('recovery_secrets').doc(userRecord.uid);
      const secretSnap = await secretRef.get();
      if (!secretSnap.exists) {
        res.status(400).json({
          error:
            'No recovery code is set on this account yet. Ask the Head Admin to reset your password in the Dashboard.',
        });
        return;
      }

      const data = secretSnap.data() as {
        codeHash?: string;
        failedAttempts?: number;
        lockedUntil?: number;
      };

      if (data.lockedUntil && data.lockedUntil > Date.now()) {
        res.status(429).json({
          error: 'Too many wrong recovery attempts for this account. Try again in 15 minutes.',
        });
        return;
      }

      const ok = data.codeHash ? verifyRecoveryCode(recoveryCode, data.codeHash) : false;
      if (!ok) {
        const nextAttempts = (data.failedAttempts || 0) + 1;
        const lock = nextAttempts >= 5 ? Date.now() + 15 * 60 * 1000 : 0;
        await secretRef.update({
          failedAttempts: lock ? 0 : nextAttempts,
          lockedUntil: lock,
          updatedAt: FieldValue.serverTimestamp(),
        });
        res.status(400).json({ error: 'Invalid email or recovery code.' });
        return;
      }

      await adminAuth.updateUser(userRecord.uid, { password: newPassword });
      await secretRef.update({
        failedAttempts: 0,
        lockedUntil: 0,
        updatedAt: FieldValue.serverTimestamp(),
      });

      res.json({ ok: true });
    } catch (err) {
      if (isIamPermissionError(err)) {
        res.status(503).json({
          code: 'iam_not_configured',
          error:
            'Password reset needs Firebase IAM permissions (roles/firebaseauth.admin and roles/datastore.user) granted to the app service account.',
        });
        return;
      }
      console.error('reset-with-recovery error:', err);
      res.status(500).json({ error: 'Could not reset password. Please try again.' });
    }
  });

  // Head Admin password reset for any user WITHOUT email
  app.post('/api/auth/admin-reset-password', async (req: Request, res: Response) => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const targetUid = req.body?.targetUid;
    const newPassword = req.body?.newPassword;

    if (typeof targetUid !== 'string' || !VALID_ID_REGEX.test(targetUid)) {
      res.status(400).json({ error: 'Invalid user ID.' });
      return;
    }
    if (typeof newPassword !== 'string' || newPassword.length < 6 || newPassword.length > 128) {
      res.status(400).json({ error: 'New password must be 6 to 128 characters.' });
      return;
    }

    try {
      const decoded = await adminAuth.verifyIdToken(token);
      if ((decoded.email || '').toLowerCase() !== HEAD_ADMIN_EMAIL.toLowerCase()) {
        res.status(403).json({ error: 'Only the Head Admin can reset other users’ passwords.' });
        return;
      }

      await adminAuth.updateUser(targetUid, { password: newPassword });
      res.json({ ok: true });
    } catch (err) {
      if (isIamPermissionError(err)) {
        res.status(503).json({
          code: 'iam_not_configured',
          error:
            'Admin password reset needs roles/firebaseauth.admin granted to the app service account in IAM.',
        });
        return;
      }
      console.error('admin-reset-password error:', err);
      res.status(500).json({ error: 'Failed to reset user password.' });
    }
  });

export default app;

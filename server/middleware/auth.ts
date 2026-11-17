import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';

interface FirebaseConfigFile {
  projectId: string;
}

export interface AuthenticatedUser {
  uid: string;
  email: string;
  emailVerified: boolean;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser;
    }
  }
}

const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let cachedCerts: Record<string, string> = {};
let certsExpiresAt = 0;

function getFirebaseProjectId(): string {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw) as FirebaseConfigFile;
  return parsed.projectId;
}

async function getPublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (now < certsExpiresAt && Object.keys(cachedCerts).length > 0) {
    return cachedCerts;
  }
  const res = await fetch(CERTS_URL);
  if (!res.ok) {
    throw new Error('Failed to fetch Firebase public signing certificates.');
  }
  const cacheControl = res.headers.get('cache-control') ?? '';
  const maxAgeMatch = /max-age=(\d+)/i.exec(cacheControl);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  cachedCerts = (await res.json()) as Record<string, string>;
  certsExpiresAt = now + maxAgeSec * 1000;
  return cachedCerts;
}

function base64UrlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64');
}

export async function verifyFirebaseIdToken(token: string): Promise<AuthenticatedUser> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed bearer token.');
  }
  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(base64UrlDecode(headerB64).toString('utf8')) as { alg?: string; kid?: string };
  const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8')) as {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    email?: string;
    email_verified?: boolean;
  };

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Invalid token algorithm or key identifier.');
  }

  const certs = await getPublicCerts();
  const cert = certs[header.kid];
  if (!cert) {
    throw new Error('Unknown Firebase signing key.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const signature = base64UrlDecode(sigB64);

  if (!verifier.verify(cert, signature)) {
    throw new Error('Invalid Firebase ID token signature.');
  }

  const projectId = getFirebaseProjectId();
  const nowSec = Math.floor(Date.now() / 1000);

  if (payload.aud !== projectId) {
    throw new Error('Token audience mismatch.');
  }
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('Token issuer mismatch.');
  }
  if (!payload.exp || payload.exp <= nowSec) {
    throw new Error('Firebase ID token expired.');
  }
  if (!payload.iat || payload.iat > nowSec + 300) {
    throw new Error('Token issued-at timestamp invalid.');
  }
  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('Token subject missing.');
  }

  return {
    uid: payload.sub,
    email: payload.email ?? '',
    emailVerified: Boolean(payload.email_verified),
  };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Missing Bearer token.' });
    return;
  }

  const token = authHeader.slice(7).trim();
  try {
    const user = await verifyFirebaseIdToken(token);
    if (!user.emailVerified) {
      res.status(403).json({ error: 'Verified email address is required for analysis endpoints.' });
      return;
    }
    req.authUser = user;
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unauthorized';
    res.status(401).json({ error: message });
  }
}

import crypto from 'crypto';

const SECRET = process.env.GUEST_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;

// Create a session token after PIN verification
export function createGuestToken(slug) {
  const ts = Date.now();
  const payload = slug + ':' + ts;
  const hmac = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  // Token valid for 24 hours
  return Buffer.from(payload + ':' + hmac).toString('base64url');
}

// Verify and extract slug from token. Returns slug or null.
export function verifyGuestToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const parts = decoded.split(':');
    if (parts.length !== 3) return null;
    const [slug, ts, hmac] = parts;
    // Check expiry (24 hours)
    if (Date.now() - parseInt(ts) > 24 * 60 * 60 * 1000) return null;
    // Verify HMAC
    const expected = crypto.createHmac('sha256', SECRET).update(slug + ':' + ts).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected))) return null;
    return slug;
  } catch { return null; }
}

// Middleware: extract and verify guest token, return slug or send 401
export function requireGuestAuth(req, res) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing guest session token' });
    return null;
  }
  const slug = verifyGuestToken(auth.replace('Bearer ', ''));
  if (!slug) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return null;
  }
  return slug;
}

import crypto from 'crypto';

const SECRET = process.env.GUEST_SESSION_SECRET;
if (!SECRET) {
  console.error('FATAL: GUEST_SESSION_SECRET environment variable is not set');
}

// Create a session token after PIN verification
// Includes both slug and guest ID for security
export function createGuestToken(slug, guestId) {
  const ts = Date.now();
  const payload = slug + ':' + (guestId || '') + ':' + ts;
  const hmac = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  // Token valid for 24 hours
  return Buffer.from(payload + ':' + hmac).toString('base64url');
}

// Verify and extract slug from token. Returns { slug, guestId } or null.
export function verifyGuestToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const parts = decoded.split(':');
    // Support both old (slug:ts:hmac) and new (slug:guestId:ts:hmac) formats
    if (parts.length === 3) {
      // Old format: slug:ts:hmac
      const [slug, ts, hmac] = parts;
      if (Date.now() - parseInt(ts) > 24 * 60 * 60 * 1000) return null;
      const expected = crypto.createHmac('sha256', SECRET).update(slug + ':' + ts).digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected))) return null;
      return { slug, guestId: null };
    }
    if (parts.length === 4) {
      // New format: slug:guestId:ts:hmac
      const [slug, guestId, ts, hmac] = parts;
      if (Date.now() - parseInt(ts) > 24 * 60 * 60 * 1000) return null;
      const expected = crypto.createHmac('sha256', SECRET).update(slug + ':' + guestId + ':' + ts).digest('hex');
      if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expected))) return null;
      return { slug, guestId: guestId || null };
    }
    return null;
  } catch { return null; }
}

// Middleware: extract and verify guest token, return slug or send 401
export function requireGuestAuth(req, res) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing guest session token' });
    return null;
  }
  const result = verifyGuestToken(auth.replace('Bearer ', ''));
  if (!result) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return null;
  }
  return result.slug;
}

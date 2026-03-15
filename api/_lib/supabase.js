import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

// Service role client (bypasses RLS - for server-side operations)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Create a client with the user's auth token (respects RLS)
export function supabaseWithAuth(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
}

// CORS headers for all API responses
const ALLOWED_ORIGINS = [
  'https://thelifeco.app',
  'https://www.thelifeco.app',
  ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()) : []),
];

export function getCorsHeaders(req) {
  const origin = req?.headers?.origin || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : '';
  if (!allowedOrigin) return {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// Handle CORS preflight
export function handleCors(req, res) {
  const headers = getCorsHeaders(req);
  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  return false;
}

// Check admin auth - returns user or sends 401/403
export async function requireAuth(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'Missing authorization token' });
    return null;
  }

  const supabase = supabaseWithAuth(req);
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return null;
  }

  // Role check: if ADMIN_EMAILS is set, verify user is in the list
  const adminEmails = process.env.ADMIN_EMAILS;
  if (adminEmails) {
    const allowed = adminEmails.split(',').map(e => e.trim().toLowerCase());
    if (!allowed.includes(user.email.toLowerCase())) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return null;
    }
  }

  return user;
}

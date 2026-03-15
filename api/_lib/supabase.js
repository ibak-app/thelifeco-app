import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

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
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Handle CORS preflight
export function handleCors(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(200).json({});
    return true;
  }
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  return false;
}

// Check admin auth - returns user or sends 401
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

  return user;
}

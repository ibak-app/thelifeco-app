import { createClient } from '@supabase/supabase-js';
import { handleCors } from '../_lib/supabase.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  try {
    switch (req.method) {
      case 'POST':
        return await handleSignIn(req, res);
      case 'DELETE':
        return await handleSignOut(req, res);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    console.error('Auth API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleSignIn(req, res) {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return res.status(401).json({ error: error.message });
  }

  return res.status(200).json({
    token: data.session.access_token,
    user: {
      id: data.user.id,
      email: data.user.email,
      role: data.user.role,
    },
  });
}

async function handleSignOut(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { error } = await supabase.auth.signOut();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ success: true });
}

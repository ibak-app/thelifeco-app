import { supabaseAdmin, handleCors, requireAuth } from '../_lib/supabase.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);

    const { data, error } = await supabaseAdmin
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Activity log fetch error:', error);
      return res.status(500).json({ error: 'Failed to fetch activity log' });
    }

    return res.status(200).json({ log: data || [] });
  } catch (err) {
    console.error('Log API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

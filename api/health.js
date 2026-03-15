import { supabaseAdmin } from './_lib/supabase.js';

export default async function handler(req, res) {
  try {
    const { error } = await supabaseAdmin
      .from('settings')
      .select('id')
      .limit(1);

    if (error) {
      return res.status(503).json({ status: 'unhealthy', error: 'Database unreachable' });
    }

    return res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (err) {
    return res.status(503).json({ status: 'unhealthy', error: err.message });
  }
}

import { supabaseAdmin, handleCors } from '../_lib/supabase.js';
import { requireGuestAuth } from '../_lib/guest-auth.js';

const ALLOWED_CATEGORIES = ['daily', 'general', 'suggestion', 'complaint'];

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const slug = requireGuestAuth(req, res);
  if (!slug) return;

  try {
    const { category, content } = req.body || {};

    if (!category || !content) {
      return res.status(400).json({ error: 'Missing category or content' });
    }

    if (!ALLOWED_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    if (String(content).length > 5000) {
      return res.status(400).json({ error: 'Content too long' });
    }

    const { data: guest, error: guestError } = await supabaseAdmin
      .from('guests')
      .select('id')
      .eq('slug', slug)
      .single();

    if (guestError || !guest) {
      return res.status(404).json({ error: 'Guest not found' });
    }

    const { data, error } = await supabaseAdmin
      .from('guest_feedback')
      .insert({ guest_id: guest.id, category, content })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to save feedback' });
    }

    return res.status(201).json({ success: true, feedback: data });
  } catch (err) {
    console.error('Feedback API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

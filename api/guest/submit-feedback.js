import { supabaseAdmin, handleCors } from '../_lib/supabase.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { slug, category, content } = req.body || {};

    if (!slug || !category || !content) {
      return res.status(400).json({ error: 'Missing slug, category, or content' });
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
    return res.status(500).json({ error: err.message });
  }
}

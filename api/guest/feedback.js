import { supabaseAdmin, handleCors } from '../_lib/supabase.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { slug, category, content } = body;

    if (!slug || !category || !content) {
      return res.status(400).json({ error: 'Missing slug, category, or content' });
    }

    if (content.length > 5000) {
      return res.status(400).json({ error: 'Content exceeds maximum length of 5000 characters' });
    }

    let guest;
    try {
      const result = await supabaseAdmin
        .from('guests')
        .select('id')
        .eq('slug', slug)
        .single();
      if (result.error || !result.data) {
        return res.status(404).json({ error: 'Guest not found', detail: result.error?.message });
      }
      guest = result.data;
    } catch (lookupErr) {
      return res.status(500).json({ error: 'Guest lookup failed', detail: lookupErr.message });
    }

    let data;
    try {
      const result = await supabaseAdmin
        .from('guest_feedback')
        .insert({
          guest_id: guest.id,
          category,
          content,
        })
        .select()
        .single();
      if (result.error) {
        return res.status(500).json({ error: 'Failed to save feedback', detail: result.error.message });
      }
      data = result.data;
    } catch (insertErr) {
      return res.status(500).json({ error: 'Insert failed', detail: insertErr.message });
    }

    return res.status(201).json({ success: true, feedback: data });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error', detail: err.message, stack: err.stack?.split('\n').slice(0, 3) });
  }
}

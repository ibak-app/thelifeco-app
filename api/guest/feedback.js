import { supabaseAdmin, handleCors } from '../_lib/supabase.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let body;
    try {
      body = req.body;
    } catch (e) {
      // Vercel body parser failed — read raw body
      body = await new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => { data += chunk; });
        req.on('end', () => { try { resolve(JSON.parse(data)); } catch (e2) { reject(e2); } });
        req.on('error', reject);
      });
    }
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    const { slug, category, content } = body;

    if (!slug || !category || !content) {
      return res.status(400).json({ error: 'Missing slug, category, or content' });
    }

    if (String(content).length > 5000) {
      return res.status(400).json({ error: 'Content exceeds maximum length of 5000 characters' });
    }

    // Look up guest by slug
    const { data: guest, error: guestError } = await supabaseAdmin
      .from('guests')
      .select('id')
      .eq('slug', slug)
      .single();

    if (guestError || !guest) {
      return res.status(404).json({ error: 'Guest not found' });
    }

    // Insert feedback
    const { data, error } = await supabaseAdmin
      .from('guest_feedback')
      .insert({
        guest_id: guest.id,
        category,
        content: String(content),
      })
      .select()
      .single();

    if (error) {
      console.error('Feedback insert error:', error);
      return res.status(500).json({ error: 'Failed to save feedback' });
    }

    return res.status(201).json({ success: true, feedback: data });
  } catch (err) {
    console.error('Feedback API error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

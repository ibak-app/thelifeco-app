import { supabaseAdmin, handleCors } from '../_lib/supabase.js';
import { requireGuestAuth } from '../_lib/guest-auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const slug = requireGuestAuth(req, res);
  if (!slug) return;

  try {
    const { activityName, rating } = req.body || {};

    if (!activityName || rating === undefined) {
      return res.status(400).json({ error: 'Missing activityName or rating' });
    }

    if (String(activityName).length > 200) {
      return res.status(400).json({ error: 'activityName too long' });
    }

    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ error: 'Rating must be an integer between 1 and 5' });
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

    // Upsert rating
    const { data, error } = await supabaseAdmin
      .from('guest_ratings')
      .upsert(
        {
          guest_id: guest.id,
          activity_name: activityName,
          rating: ratingNum,
        },
        { onConflict: 'guest_id, activity_name' }
      )
      .select()
      .single();

    if (error) {
      console.error('Rating upsert error:', error);
      return res.status(500).json({ error: 'Failed to save rating' });
    }

    return res.status(200).json({ success: true, rating: data });
  } catch (err) {
    console.error('Ratings API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

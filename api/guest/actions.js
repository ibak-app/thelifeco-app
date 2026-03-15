import { supabaseAdmin, handleCors } from '../_lib/supabase.js';
import { requireGuestAuth } from '../_lib/guest-auth.js';

const ALLOWED_FEEDBACK_CATEGORIES = ['daily', 'general', 'suggestion', 'complaint'];

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const slug = requireGuestAuth(req, res);
  if (!slug) return;

  const { type } = req.query;

  try {
    switch (type) {
      case 'favorites':
        return await handleFavorites(slug, req, res);
      case 'ratings':
        return await handleRatings(slug, req, res);
      case 'feedback':
        return await handleFeedback(slug, req, res);
      default:
        return res.status(400).json({ error: 'Invalid or missing type parameter. Use: favorites, ratings, or feedback' });
    }
  } catch (err) {
    console.error(`Guest actions API error (${type}):`, err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ─── Shared helper ───────────────────────────────────────────────────────────

async function getGuestId(slug) {
  const { data, error } = await supabaseAdmin
    .from('guests')
    .select('id')
    .eq('slug', slug)
    .single();

  if (error || !data) return null;
  return data.id;
}

// ─── Favorites ───────────────────────────────────────────────────────────────

async function handleFavorites(slug, req, res) {
  switch (req.method) {
    case 'GET':
      return await favoritesGet(slug, res);
    case 'POST':
      return await favoritesPost(slug, req, res);
    case 'DELETE':
      return await favoritesDelete(slug, req, res);
    default:
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function favoritesGet(slug, res) {
  const guestId = await getGuestId(slug);
  if (!guestId) return res.status(404).json({ error: 'Guest not found' });

  const { data, error } = await supabaseAdmin
    .from('guest_favorites')
    .select('therapy_name, created_at')
    .eq('guest_id', guestId)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: 'Failed to fetch favorites' });

  return res.status(200).json({ favorites: data || [] });
}

async function favoritesPost(slug, req, res) {
  const { therapyName } = req.body || {};
  if (!therapyName) return res.status(400).json({ error: 'Missing therapyName' });
  if (String(therapyName).length > 200) return res.status(400).json({ error: 'therapyName too long' });

  const guestId = await getGuestId(slug);
  if (!guestId) return res.status(404).json({ error: 'Guest not found' });

  const { data, error } = await supabaseAdmin
    .from('guest_favorites')
    .upsert(
      { guest_id: guestId, therapy_name: therapyName },
      { onConflict: 'guest_id, therapy_name' }
    )
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Failed to add favorite' });

  return res.status(200).json({ success: true, favorite: data });
}

async function favoritesDelete(slug, req, res) {
  const { therapyName } = req.body || {};
  if (!therapyName) return res.status(400).json({ error: 'Missing therapyName' });
  if (String(therapyName).length > 200) return res.status(400).json({ error: 'therapyName too long' });

  const guestId = await getGuestId(slug);
  if (!guestId) return res.status(404).json({ error: 'Guest not found' });

  const { error } = await supabaseAdmin
    .from('guest_favorites')
    .delete()
    .eq('guest_id', guestId)
    .eq('therapy_name', therapyName);

  if (error) return res.status(500).json({ error: 'Failed to remove favorite' });

  return res.status(200).json({ success: true });
}

// ─── Ratings ─────────────────────────────────────────────────────────────────

async function handleRatings(slug, req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { activityName, rating } = req.body || {};
  if (!activityName || rating === undefined) return res.status(400).json({ error: 'Missing activityName or rating' });
  if (String(activityName).length > 200) return res.status(400).json({ error: 'activityName too long' });

  const ratingNum = Number(rating);
  if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
    return res.status(400).json({ error: 'Rating must be an integer between 1 and 5' });
  }

  const guestId = await getGuestId(slug);
  if (!guestId) return res.status(404).json({ error: 'Guest not found' });

  const { data, error } = await supabaseAdmin
    .from('guest_ratings')
    .upsert(
      { guest_id: guestId, activity_name: activityName, rating: ratingNum },
      { onConflict: 'guest_id, activity_name' }
    )
    .select()
    .single();

  if (error) {
    console.error('Rating upsert error:', error);
    return res.status(500).json({ error: 'Failed to save rating' });
  }

  return res.status(200).json({ success: true, rating: data });
}

// ─── Feedback ────────────────────────────────────────────────────────────────

async function handleFeedback(slug, req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { category, content } = req.body || {};
  if (!category || !content) return res.status(400).json({ error: 'Missing category or content' });
  if (!ALLOWED_FEEDBACK_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category' });
  if (String(content).length > 5000) return res.status(400).json({ error: 'Content too long' });

  const guestId = await getGuestId(slug);
  if (!guestId) return res.status(404).json({ error: 'Guest not found' });

  const { data, error } = await supabaseAdmin
    .from('guest_feedback')
    .insert({ guest_id: guestId, category, content })
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Failed to save feedback' });

  return res.status(201).json({ success: true, feedback: data });
}

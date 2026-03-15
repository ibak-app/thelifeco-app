import { supabaseAdmin, handleCors } from '../_lib/supabase.js';
import { requireGuestAuth } from '../_lib/guest-auth.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const slug = requireGuestAuth(req, res);
  if (!slug) return;

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(slug, res);
      case 'POST':
        return await handlePost(slug, req, res);
      case 'DELETE':
        return await handleDelete(slug, req, res);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    console.error('Favorites API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getGuestId(slug) {
  const { data, error } = await supabaseAdmin
    .from('guests')
    .select('id')
    .eq('slug', slug)
    .single();

  if (error || !data) return null;
  return data.id;
}

async function handleGet(slug, res) {
  const guestId = await getGuestId(slug);
  if (!guestId) {
    return res.status(404).json({ error: 'Guest not found' });
  }

  const { data, error } = await supabaseAdmin
    .from('guest_favorites')
    .select('therapy_name, created_at')
    .eq('guest_id', guestId)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: 'Failed to fetch favorites' });
  }

  return res.status(200).json({ favorites: data || [] });
}

async function handlePost(slug, req, res) {
  const { therapyName } = req.body || {};

  if (!therapyName) {
    return res.status(400).json({ error: 'Missing therapyName' });
  }

  if (String(therapyName).length > 200) {
    return res.status(400).json({ error: 'therapyName too long' });
  }

  const guestId = await getGuestId(slug);
  if (!guestId) {
    return res.status(404).json({ error: 'Guest not found' });
  }

  const { data, error } = await supabaseAdmin
    .from('guest_favorites')
    .upsert(
      { guest_id: guestId, therapy_name: therapyName },
      { onConflict: 'guest_id, therapy_name' }
    )
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: 'Failed to add favorite' });
  }

  return res.status(200).json({ success: true, favorite: data });
}

async function handleDelete(slug, req, res) {
  const { therapyName } = req.body || {};

  if (!therapyName) {
    return res.status(400).json({ error: 'Missing therapyName' });
  }

  if (String(therapyName).length > 200) {
    return res.status(400).json({ error: 'therapyName too long' });
  }

  const guestId = await getGuestId(slug);
  if (!guestId) {
    return res.status(404).json({ error: 'Guest not found' });
  }

  const { error } = await supabaseAdmin
    .from('guest_favorites')
    .delete()
    .eq('guest_id', guestId)
    .eq('therapy_name', therapyName);

  if (error) {
    return res.status(500).json({ error: 'Failed to remove favorite' });
  }

  return res.status(200).json({ success: true });
}

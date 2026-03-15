import crypto from 'crypto';
import { supabaseAdmin, handleCors } from '../_lib/supabase.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const { slug } = req.query;

  if (!slug) {
    return res.status(400).json({ error: 'Missing slug parameter' });
  }

  try {
    if (req.method === 'GET') {
      return await handleGet(slug, res);
    } else if (req.method === 'POST') {
      return await handlePost(slug, req, res);
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    console.error('Guest API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleGet(slug, res) {
  const { data: guest, error: guestError } = await supabaseAdmin
    .from('guests')
    .select('id, first_name, last_name, programme, check_in, duration, wa_base, room, email')
    .eq('slug', slug)
    .single();

  if (guestError || !guest) {
    return res.status(404).json({ error: 'Guest not found' });
  }

  const [
    scheduleResult,
    descriptionsResult,
    categoriesResult,
    therapiesResult,
    hydrationResult,
    infoContentResult,
    nutritionPlansResult,
    settingsResult,
    favoritesResult,
  ] = await Promise.all([
    supabaseAdmin
      .from('schedule_activities')
      .select('activity_date, time, name, type')
      .eq('guest_id', guest.id)
      .order('activity_date', { ascending: true })
      .order('sort_order', { ascending: true }),

    supabaseAdmin
      .from('activity_descriptions')
      .select('name, description'),

    supabaseAdmin
      .from('therapy_categories')
      .select('id, title, image_path')
      .order('sort_order', { ascending: true }),

    supabaseAdmin
      .from('therapies')
      .select('category_id, name, description, image_url, price_usd, duration, is_popular, is_recommended')
      .order('sort_order', { ascending: true }),

    supabaseAdmin
      .from('hydration_items')
      .select('time, name, icon, note')
      .order('sort_order', { ascending: true }),

    supabaseAdmin
      .from('info_content')
      .select('section_key, content'),

    supabaseAdmin
      .from('nutrition_plans')
      .select('name, calories, description'),

    supabaseAdmin
      .from('settings')
      .select('resort_name, whatsapp_number')
      .single(),

    supabaseAdmin
      .from('guest_favorites')
      .select('therapy_name')
      .eq('guest_id', guest.id),
  ]);

  // Group schedule by date
  const schedule = {};
  if (scheduleResult.data) {
    for (const item of scheduleResult.data) {
      const dateKey = item.activity_date;
      if (!schedule[dateKey]) schedule[dateKey] = [];
      schedule[dateKey].push({ time: item.time, name: item.name, type: item.type });
    }
  }

  // Build descriptions map
  const descriptions = {};
  if (descriptionsResult.data) {
    for (const item of descriptionsResult.data) {
      descriptions[item.name] = item.description;
    }
  }

  // Build categories with nested therapies, images, and prices
  const categories = (categoriesResult.data || []).map(cat => ({
    id: cat.id,
    title: cat.title,
    imagePath: cat.image_path,
    therapies: (therapiesResult.data || [])
      .filter(t => t.category_id === cat.id)
      .map(t => ({ name: t.name, description: t.description, popular: t.is_popular, recommended: t.is_recommended })),
  }));

  // Build therapy images map
  const therapyImages = {};
  const therapyPrices = {};
  if (therapiesResult.data) {
    for (const t of therapiesResult.data) {
      if (t.image_url) therapyImages[t.name] = t.image_url;
      if (t.price_usd) therapyPrices[t.name] = { price: t.price_usd, duration: t.duration };
    }
  }

  // Build info content map
  const infoContent = {};
  if (infoContentResult.data) {
    for (const item of infoContentResult.data) {
      infoContent[item.section_key] = item.content;
    }
  }

  const favorites = favoritesResult.data ? favoritesResult.data.map(f => f.therapy_name) : [];

  return res.status(200).json({
    guest: {
      firstName: guest.first_name,
      lastName: guest.last_name,
      programme: guest.programme,
      checkIn: guest.check_in,
      totalDays: guest.duration,
      waBase: guest.wa_base,
      room: guest.room,
    },
    schedule,
    descriptions,
    categories,
    therapyImages,
    therapyPrices,
    hydration: hydrationResult.data || [],
    infoContent,
    nutritionPlans: nutritionPlansResult.data || [],
    settings: settingsResult.data || { resort_name: 'TheLifeCo', whatsapp_number: '' },
    favorites,
  });
}

async function handlePost(slug, req, res) {
  const { pin } = req.body || {};

  if (!pin) {
    return res.status(400).json({ error: 'Missing pin' });
  }

  // Fetch guest's pin_hash
  const { data: guest, error } = await supabaseAdmin
    .from('guests')
    .select('pin_hash')
    .eq('slug', slug)
    .single();

  if (error || !guest) {
    return res.status(404).json({ error: 'Guest not found' });
  }

  // Hash the provided PIN and compare
  const inputHash = crypto
    .createHash('sha256')
    .update(String(pin))
    .digest('hex');

  const valid = inputHash === guest.pin_hash;

  return res.status(200).json({ valid });
}

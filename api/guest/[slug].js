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
  // Fetch guest by slug
  const { data: guest, error: guestError } = await supabaseAdmin
    .from('guests')
    .select('id, first_name, last_name, programme, check_in, total_days, wa_base, room, email')
    .eq('slug', slug)
    .single();

  if (guestError || !guest) {
    return res.status(404).json({ error: 'Guest not found' });
  }

  // Fetch all related data in parallel
  const [
    scheduleResult,
    descriptionsResult,
    categoriesResult,
    therapyImagesResult,
    therapyPricesResult,
    hydrationResult,
    infoContentResult,
    nutritionPlansResult,
    settingsResult,
    favoritesResult,
  ] = await Promise.all([
    supabaseAdmin
      .from('schedule')
      .select('date, time, name, type')
      .eq('guest_id', guest.id)
      .order('date', { ascending: true })
      .order('time', { ascending: true }),

    supabaseAdmin
      .from('activity_descriptions')
      .select('name, description'),

    supabaseAdmin
      .from('therapy_categories')
      .select(`
        id, title, image_path,
        therapies (name, description, popular, recommended)
      `)
      .order('sort_order', { ascending: true }),

    supabaseAdmin
      .from('therapy_images')
      .select('name, url'),

    supabaseAdmin
      .from('therapy_prices')
      .select('name, price, duration'),

    supabaseAdmin
      .from('hydration')
      .select('time, name, icon, note')
      .order('time', { ascending: true }),

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
      .from('favorites')
      .select('therapy_name')
      .eq('guest_id', guest.id),
  ]);

  // Group schedule by date
  const schedule = {};
  if (scheduleResult.data) {
    for (const item of scheduleResult.data) {
      const dateKey = item.date;
      if (!schedule[dateKey]) {
        schedule[dateKey] = [];
      }
      schedule[dateKey].push({
        time: item.time,
        name: item.name,
        type: item.type,
      });
    }
  }

  // Build descriptions map
  const descriptions = {};
  if (descriptionsResult.data) {
    for (const item of descriptionsResult.data) {
      descriptions[item.name] = item.description;
    }
  }

  // Build therapy images map
  const therapyImages = {};
  if (therapyImagesResult.data) {
    for (const item of therapyImagesResult.data) {
      therapyImages[item.name] = item.url;
    }
  }

  // Build therapy prices map
  const therapyPrices = {};
  if (therapyPricesResult.data) {
    for (const item of therapyPricesResult.data) {
      therapyPrices[item.name] = {
        price: item.price,
        duration: item.duration,
      };
    }
  }

  // Build info content map
  const infoContent = {};
  if (infoContentResult.data) {
    for (const item of infoContentResult.data) {
      infoContent[item.section_key] = item.content;
    }
  }

  // Build favorites set
  const favorites = favoritesResult.data
    ? favoritesResult.data.map(f => f.therapy_name)
    : [];

  return res.status(200).json({
    guest: {
      firstName: guest.first_name,
      lastName: guest.last_name,
      programme: guest.programme,
      checkIn: guest.check_in,
      totalDays: guest.total_days,
      waBase: guest.wa_base,
      room: guest.room,
    },
    schedule,
    descriptions,
    categories: categoriesResult.data || [],
    therapyImages,
    therapyPrices,
    hydration: hydrationResult.data || [],
    infoContent,
    nutritionPlans: nutritionPlansResult.data || [],
    settings: settingsResult.data || { resortName: 'TheLifeCo', whatsappNumber: '' },
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

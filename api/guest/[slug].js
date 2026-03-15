import crypto from 'crypto';
import { supabaseAdmin, handleCors } from '../_lib/supabase.js';
import { createGuestToken, requireGuestAuth } from '../_lib/guest-auth.js';

// Basic in-memory rate limiter for PIN attempts.
// NOTE: This is ephemeral per serverless instance (resets on cold start).
// For production at scale, upgrade to Redis or Supabase-based rate limiting.
const pinAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(slug) {
  const now = Date.now();
  const record = pinAttempts.get(slug);
  if (!record) return true;
  // Clean expired entries
  if (now - record.first > LOCKOUT_MS) {
    pinAttempts.delete(slug);
    return true;
  }
  return record.count < MAX_ATTEMPTS;
}

function recordAttempt(slug) {
  const now = Date.now();
  const record = pinAttempts.get(slug);
  if (!record || now - record.first > LOCKOUT_MS) {
    pinAttempts.set(slug, { count: 1, first: now });
  } else {
    record.count++;
  }
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const { slug } = req.query;

  if (!slug) {
    return res.status(400).json({ error: 'Missing slug parameter' });
  }

  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(slug)) {
    return res.status(400).json({ error: 'Invalid slug format' });
  }

  try {
    if (req.method === 'GET') {
      const authSlug = requireGuestAuth(req, res);
      if (!authSlug) return;
      if (authSlug !== slug) return res.status(403).json({ error: 'Token does not match slug' });
      return await handleGet(slug, res);
    } else if (req.method === 'POST') {
      return await handlePost(slug, req, res);
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    console.error('Guest API error:', err);
    return res.status(500).json({ error: 'Internal server error', debug: err.message });
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

  const results = await Promise.allSettled([
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
      .select('name, calories, description')
      .order('sort_order', { ascending: true }),

    supabaseAdmin
      .from('settings')
      .select('resort_name, whatsapp_number')
      .single(),

    supabaseAdmin
      .from('guest_favorites')
      .select('therapy_name')
      .eq('guest_id', guest.id),
  ]);

  const settled = (i) => results[i].status === 'fulfilled' ? results[i].value : { data: null };
  const scheduleResult = settled(0);
  const descriptionsResult = settled(1);
  const categoriesResult = settled(2);
  const therapiesResult = settled(3);
  const hydrationResult = settled(4);
  const infoContentResult = settled(5);
  const nutritionPlansResult = settled(6);
  const settingsResult = settled(7);
  const favoritesResult = settled(8);

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

  // Compute guest stay status using St. Lucia timezone (UTC-4, no DST)
  const now = new Date();
  const checkInDate = new Date(guest.check_in + 'T00:00:00-04:00');
  const checkOutDate = new Date(checkInDate);
  checkOutDate.setDate(checkOutDate.getDate() + guest.duration);
  let status = 'active';
  if (now < checkInDate) status = 'upcoming';
  else if (now > checkOutDate) status = 'completed';

  return res.status(200).json({
    guest: {
      firstName: guest.first_name,
      lastName: guest.last_name,
      programme: guest.programme,
      checkIn: guest.check_in,
      totalDays: guest.duration,
      waBase: guest.wa_base,
      room: guest.room,
      status,
    },
    schedule,
    descriptions,
    categories,
    therapyImages,
    therapyPrices,
    hydration: hydrationResult.data || [],
    infoContent,
    nutritionPlans: nutritionPlansResult.data || [],
    settings: settingsResult.data
      ? { resortName: settingsResult.data.resort_name, whatsappNumber: settingsResult.data.whatsapp_number }
      : { resortName: 'TheLifeCo', whatsappNumber: '' },
    favorites,
  });
}

async function handlePost(slug, req, res) {
  const { pin } = req.body || {};

  if (!pin) {
    return res.status(400).json({ error: 'Missing pin' });
  }

  if (!checkRateLimit(slug)) {
    return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  }
  recordAttempt(slug);

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

  const match = crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(guest.pin_hash));

  if (!match) {
    return res.status(200).json({ valid: false });
  }

  return res.status(200).json({ valid: true, token: createGuestToken(slug) });
}

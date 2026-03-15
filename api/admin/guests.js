import crypto from 'crypto';
import { supabaseAdmin, handleCors, requireAuth } from '../_lib/supabase.js';

function validateString(val, maxLen = 500) {
  return typeof val === 'string' && val.length <= maxLen;
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  // All admin routes require auth
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(req, res);
      case 'POST':
        return await handlePost(req, res, user);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    console.error('Admin guests API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

function computeStatus(checkIn, duration) {
  const now = new Date();
  const checkInDate = new Date(checkIn + 'T00:00:00-04:00');
  const checkOutDate = new Date(checkInDate);
  checkOutDate.setDate(checkOutDate.getDate() + duration);

  if (now < checkInDate) return 'upcoming';
  if (now > checkOutDate) return 'completed';
  return 'active';
}

function generateSlug(firstName, lastName) {
  return `${firstName}-${lastName}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function generatePin() {
  // Random 4-digit PIN (1000-9999)
  const num = crypto.randomInt(1000, 10000);
  return String(num);
}

function generatePinHash(pin) {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

async function handleGet(req, res) {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = (page - 1) * limit;

  const { data: guests, error } = await supabaseAdmin
    .from('guests')
    .select('*')
    .order('check_in', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return res.status(500).json({ error: 'Failed to fetch guests' });
  }

  // Add computed fields
  const enriched = (guests || []).map(guest => {
    const checkOutDate = new Date(guest.check_in);
    checkOutDate.setDate(checkOutDate.getDate() + guest.duration);

    const now = new Date();
    const diffMs = checkOutDate - now;
    const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

    return {
      ...guest,
      checkOut: checkOutDate.toISOString().split('T')[0],
      daysLeft,
      status: computeStatus(guest.check_in, guest.duration),
    };
  });

  return res.status(200).json({ guests: enriched, page, limit });
}

async function handlePost(req, res, user) {
  const body = req.body || {};
  const firstName = body.firstName;
  const lastName = body.lastName;
  const email = body.email;
  const whatsapp = body.whatsapp;
  const checkIn = body.checkIn || body.checkin;
  const duration = body.duration;
  const programme = body.programme;
  const room = body.room;
  const notes = body.notes;

  if (!firstName || !lastName || !checkIn || !duration) {
    return res.status(400).json({
      error: 'Missing required fields: firstName, lastName, checkIn, duration',
    });
  }

  // Input validation
  if (!validateString(firstName, 100)) {
    return res.status(400).json({ error: 'firstName must be a string up to 100 characters' });
  }
  if (!validateString(lastName, 100)) {
    return res.status(400).json({ error: 'lastName must be a string up to 100 characters' });
  }
  if (email && !validateString(email, 254)) {
    return res.status(400).json({ error: 'email must be a string up to 254 characters' });
  }
  if (whatsapp && !validateString(whatsapp, 20)) {
    return res.status(400).json({ error: 'whatsapp must be a string up to 20 characters' });
  }
  if (programme && !validateString(programme, 100)) {
    return res.status(400).json({ error: 'programme must be a string up to 100 characters' });
  }
  if (room && !validateString(room, 50)) {
    return res.status(400).json({ error: 'room must be a string up to 50 characters' });
  }
  if (notes && !validateString(notes, 2000)) {
    return res.status(400).json({ error: 'notes must be a string up to 2000 characters' });
  }

  // Duration validation
  const durationNum = Number(duration);
  if (!Number.isInteger(durationNum) || durationNum < 1 || durationNum > 365) {
    return res.status(400).json({ error: 'Duration must be 1-365 days' });
  }

  const slug = generateSlug(firstName, lastName);
  const pin = generatePin();
  const pinHash = generatePinHash(pin);
  const status = computeStatus(checkIn, durationNum);

  // Check for slug collision
  const { data: existing } = await supabaseAdmin
    .from('guests')
    .select('slug')
    .eq('slug', slug)
    .single();

  const finalSlug = existing
    ? `${slug}-${crypto.randomBytes(3).toString('hex')}`
    : slug;

  const { data: guest, error } = await supabaseAdmin
    .from('guests')
    .insert({
      first_name: firstName,
      last_name: lastName,
      email: email || null,
      whatsapp: whatsapp || null,
      check_in: checkIn,
      duration: durationNum,
      programme: programme || null,
      room: room || null,
      notes: notes || null,
      slug: finalSlug,
      pin_hash: pinHash,
      status,
    })
    .select()
    .single();

  if (error) {
    console.error('Guest insert error:', error);
    return res.status(500).json({ error: 'Failed to create guest' });
  }

  // Log activity
  await supabaseAdmin
    .from('activity_log')
    .insert({
      action: 'guest_created',
      details: `Created guest ${firstName} ${lastName} (${finalSlug})`,
      user_display: user.email,
    })
    .catch(err => console.error('Activity log error:', err));

  return res.status(201).json({ success: true, guest: { ...guest, pin } });
}

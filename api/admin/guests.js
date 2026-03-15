import crypto from 'crypto';
import { supabaseAdmin, handleCors, requireAuth } from '../_lib/supabase.js';

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
  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkInDate);
  checkOutDate.setDate(checkOutDate.getDate() + duration);

  if (now < checkInDate) return 'upcoming';
  if (now > checkOutDate) return 'checked-out';
  return 'active';
}

function generateSlug(firstName, lastName) {
  return `${firstName}-${lastName}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function generatePinHash(checkIn) {
  // PIN = MMDD of check-in date
  const date = new Date(checkIn);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const pin = mm + dd;
  return crypto.createHash('sha256').update(pin).digest('hex');
}

async function handleGet(req, res) {
  const { data: guests, error } = await supabaseAdmin
    .from('guests')
    .select('*')
    .order('check_in', { ascending: false });

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

  return res.status(200).json({ guests: enriched });
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

  const slug = generateSlug(firstName, lastName);
  const pinHash = generatePinHash(checkIn);
  const status = computeStatus(checkIn, duration);

  // Check for slug collision
  const { data: existing } = await supabaseAdmin
    .from('guests')
    .select('slug')
    .eq('slug', slug)
    .single();

  const finalSlug = existing
    ? `${slug}-${Date.now().toString(36)}`
    : slug;

  const { data: guest, error } = await supabaseAdmin
    .from('guests')
    .insert({
      first_name: firstName,
      last_name: lastName,
      email: email || null,
      whatsapp: whatsapp || null,
      check_in: checkIn,
      duration: duration,
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
    });

  return res.status(201).json({ success: true, guest });
}

import { supabaseAdmin, handleCors, requireAuth } from '../../_lib/supabase.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Missing guest id' });
  }

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(id, res);
      case 'PUT':
        return await handlePut(id, req, res, user);
      case 'DELETE':
        return await handleDelete(id, res, user);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    console.error('Admin guest [id] API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleGet(id, res) {
  const { data: guest, error: guestError } = await supabaseAdmin
    .from('guests')
    .select('*')
    .eq('id', id)
    .single();

  if (guestError || !guest) {
    return res.status(404).json({ error: 'Guest not found' });
  }

  // Fetch schedule grouped by date
  const { data: scheduleData, error: scheduleError } = await supabaseAdmin
    .from('schedule')
    .select('date, time, name, type')
    .eq('guest_id', id)
    .order('date', { ascending: true })
    .order('time', { ascending: true });

  const schedule = {};
  if (scheduleData) {
    for (const item of scheduleData) {
      if (!schedule[item.date]) {
        schedule[item.date] = [];
      }
      schedule[item.date].push({
        time: item.time,
        name: item.name,
        type: item.type,
      });
    }
  }

  // Compute checkout and status
  const checkOutDate = new Date(guest.check_in);
  checkOutDate.setDate(checkOutDate.getDate() + guest.total_days);

  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((checkOutDate - now) / (1000 * 60 * 60 * 24)));

  let status = 'active';
  if (now < new Date(guest.check_in)) status = 'upcoming';
  else if (now > checkOutDate) status = 'checked-out';

  return res.status(200).json({
    guest: {
      ...guest,
      checkOut: checkOutDate.toISOString().split('T')[0],
      daysLeft,
      status,
    },
    schedule,
  });
}

async function handlePut(id, req, res, user) {
  const updates = req.body || {};

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  // Map camelCase to snake_case for allowed fields
  const fieldMap = {
    firstName: 'first_name',
    lastName: 'last_name',
    email: 'email',
    whatsapp: 'whatsapp',
    checkIn: 'check_in',
    duration: 'total_days',
    totalDays: 'total_days',
    programme: 'programme',
    room: 'room',
    notes: 'notes',
    waBase: 'wa_base',
    status: 'status',
  };

  const dbUpdates = {};
  for (const [key, value] of Object.entries(updates)) {
    if (fieldMap[key]) {
      dbUpdates[fieldMap[key]] = value;
    }
  }

  if (Object.keys(dbUpdates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  dbUpdates.updated_at = new Date().toISOString();

  const { data: guest, error } = await supabaseAdmin
    .from('guests')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Guest update error:', error);
    return res.status(500).json({ error: 'Failed to update guest' });
  }

  if (!guest) {
    return res.status(404).json({ error: 'Guest not found' });
  }

  // Log activity
  await supabaseAdmin
    .from('activity_log')
    .insert({
      action: 'guest_updated',
      details: `Updated guest ${id}: ${Object.keys(updates).join(', ')}`,
      performed_by: user.email,
    });

  return res.status(200).json({ success: true, guest });
}

async function handleDelete(id, res, user) {
  // Fetch guest name for logging
  const { data: guest } = await supabaseAdmin
    .from('guests')
    .select('first_name, last_name, slug')
    .eq('id', id)
    .single();

  if (!guest) {
    return res.status(404).json({ error: 'Guest not found' });
  }

  // Delete cascade: schedule, favorites, ratings, feedback first
  await Promise.all([
    supabaseAdmin.from('schedule').delete().eq('guest_id', id),
    supabaseAdmin.from('favorites').delete().eq('guest_id', id),
    supabaseAdmin.from('ratings').delete().eq('guest_id', id),
    supabaseAdmin.from('feedback').delete().eq('guest_id', id),
  ]);

  // Delete the guest
  const { error } = await supabaseAdmin
    .from('guests')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Guest delete error:', error);
    return res.status(500).json({ error: 'Failed to delete guest' });
  }

  // Log activity
  await supabaseAdmin
    .from('activity_log')
    .insert({
      action: 'guest_deleted',
      details: `Deleted guest ${guest.first_name} ${guest.last_name} (${guest.slug})`,
      performed_by: user.email,
    });

  return res.status(200).json({ success: true });
}

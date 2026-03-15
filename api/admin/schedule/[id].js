import { supabaseAdmin, handleCors, requireAuth } from '../../_lib/supabase.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const { id } = req.query; // guest_id

  if (!id) {
    return res.status(400).json({ error: 'Missing guest id' });
  }

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(id, res);
      case 'PUT':
        return await handlePut(id, req, res, user);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    console.error('Admin schedule API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleGet(guestId, res) {
  // Verify guest exists
  const { data: guest, error: guestError } = await supabaseAdmin
    .from('guests')
    .select('id, first_name, last_name')
    .eq('id', guestId)
    .single();

  if (guestError || !guest) {
    return res.status(404).json({ error: 'Guest not found' });
  }

  const { data, error } = await supabaseAdmin
    .from('schedule')
    .select('id, date, time, name, type')
    .eq('guest_id', guestId)
    .order('date', { ascending: true })
    .order('time', { ascending: true });

  if (error) {
    return res.status(500).json({ error: 'Failed to fetch schedule' });
  }

  // Group by date
  const schedule = {};
  for (const item of data || []) {
    if (!schedule[item.date]) {
      schedule[item.date] = [];
    }
    schedule[item.date].push({
      id: item.id,
      time: item.time,
      name: item.name,
      type: item.type,
    });
  }

  return res.status(200).json({
    guest: { id: guest.id, firstName: guest.first_name, lastName: guest.last_name },
    schedule,
  });
}

async function handlePut(guestId, req, res, user) {
  const { activities } = req.body || {};

  if (!Array.isArray(activities)) {
    return res.status(400).json({ error: 'Missing activities array' });
  }

  // Verify guest exists
  const { data: guest, error: guestError } = await supabaseAdmin
    .from('guests')
    .select('id, first_name, last_name')
    .eq('id', guestId)
    .single();

  if (guestError || !guest) {
    return res.status(404).json({ error: 'Guest not found' });
  }

  // Validate activities
  for (const activity of activities) {
    if (!activity.date || !activity.time || !activity.name) {
      return res.status(400).json({
        error: 'Each activity must have date, time, and name',
      });
    }
  }

  // Delete existing schedule
  const { error: deleteError } = await supabaseAdmin
    .from('schedule')
    .delete()
    .eq('guest_id', guestId);

  if (deleteError) {
    console.error('Schedule delete error:', deleteError);
    return res.status(500).json({ error: 'Failed to clear existing schedule' });
  }

  // Insert new schedule
  if (activities.length > 0) {
    const rows = activities.map(a => ({
      guest_id: guestId,
      date: a.date,
      time: a.time,
      name: a.name,
      type: a.type || 'activity',
    }));

    const { error: insertError } = await supabaseAdmin
      .from('schedule')
      .insert(rows);

    if (insertError) {
      console.error('Schedule insert error:', insertError);
      return res.status(500).json({ error: 'Failed to insert schedule' });
    }
  }

  // Log activity
  await supabaseAdmin
    .from('activity_log')
    .insert({
      action: 'schedule_updated',
      details: `Updated schedule for ${guest.first_name} ${guest.last_name} (${activities.length} activities)`,
      performed_by: user.email,
    });

  return res.status(200).json({
    success: true,
    count: activities.length,
  });
}

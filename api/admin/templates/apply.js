import { supabaseAdmin, handleCors, requireAuth } from '../../_lib/supabase.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { templateId, guestId } = req.body || {};
  if (!templateId || !guestId) return res.status(400).json({ error: 'Missing templateId or guestId' });

  // Get template
  const { data: template, error: tErr } = await supabaseAdmin
    .from('programme_templates')
    .select('schedule_data, duration')
    .eq('id', templateId)
    .single();
  if (tErr || !template) return res.status(404).json({ error: 'Template not found' });

  // Get guest check-in date
  const { data: guest, error: gErr } = await supabaseAdmin
    .from('guests')
    .select('check_in, first_name, last_name')
    .eq('id', guestId)
    .single();
  if (gErr || !guest) return res.status(404).json({ error: 'Guest not found' });

  if (!template.schedule_data || !Array.isArray(template.schedule_data)) {
    return res.status(400).json({ error: 'Template has no schedule data' });
  }

  // Save existing data for atomic rollback
  const { data: oldData } = await supabaseAdmin
    .from('schedule_activities')
    .select('*')
    .eq('guest_id', guestId);

  // Delete existing schedule
  const { error: delErr } = await supabaseAdmin
    .from('schedule_activities')
    .delete()
    .eq('guest_id', guestId);

  if (delErr) {
    return res.status(500).json({ error: 'Failed to clear schedule' });
  }

  // Build activities from template schedule_data
  // schedule_data is expected to be an array of { day: 1, time: "07:00", name: "...", type: "group" }
  const checkIn = new Date(guest.check_in + 'T00:00:00');
  const rows = template.schedule_data.map((item, index) => {
    const actDate = new Date(checkIn);
    actDate.setDate(actDate.getDate() + (item.day - 1));
    const dateStr = actDate.toISOString().split('T')[0];
    return {
      guest_id: guestId,
      activity_date: dateStr,
      time: item.time,
      name: item.name,
      type: item.type || 'group',
      sort_order: index,
    };
  });

  if (rows.length > 0) {
    const { error: insertErr } = await supabaseAdmin.from('schedule_activities').insert(rows);
    if (insertErr) {
      // Attempt to restore old data
      if (oldData && oldData.length > 0) {
        await supabaseAdmin.from('schedule_activities').insert(oldData);
      }
      return res.status(500).json({ error: 'Failed to create schedule' });
    }
  }

  await supabaseAdmin.from('activity_log').insert({
    action: 'template_applied',
    details: `Applied template to ${guest.first_name} ${guest.last_name} (${rows.length} activities)`,
    user_display: user.email,
    guest_id: guestId,
  }).catch(err => console.error('Activity log error:', err));

  return res.status(200).json({ success: true, count: rows.length });
}

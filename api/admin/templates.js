import { supabaseAdmin, handleCors, requireAuth } from '../_lib/supabase.js';

function validateString(val, maxLen = 500) {
  return typeof val === 'string' && val.length <= maxLen;
}

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(res);
      case 'POST':
        return await handlePost(req, res, user);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    console.error('Templates API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleGet(res) {
  const { data, error } = await supabaseAdmin
    .from('programme_templates')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: 'Failed to fetch templates' });
  }

  return res.status(200).json({ templates: data || [] });
}

async function handlePost(req, res, user) {
  const { name, programme, duration, scheduleData } = req.body || {};

  if (!name || !programme) {
    return res.status(400).json({ error: 'Missing required fields: name, programme' });
  }

  // Input validation
  if (!validateString(name, 200)) {
    return res.status(400).json({ error: 'name must be a string up to 200 characters' });
  }
  if (!validateString(programme, 100)) {
    return res.status(400).json({ error: 'programme must be a string up to 100 characters' });
  }

  const { data, error } = await supabaseAdmin
    .from('programme_templates')
    .insert({
      name,
      programme,
      duration: duration || null,
      schedule_data: scheduleData || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Template insert error:', error);
    return res.status(500).json({ error: 'Failed to create template' });
  }

  // Log activity
  await supabaseAdmin
    .from('activity_log')
    .insert({
      action: 'template_created',
      details: `Created template "${name}" for programme "${programme}"`,
      user_display: user.email,
    })
    .catch(err => console.error('Activity log error:', err));

  return res.status(201).json({ success: true, template: data });
}

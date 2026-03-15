import { supabaseAdmin, handleCors, requireAuth } from '../_lib/supabase.js';

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
      case 'DELETE':
        return await handleDelete(req, res, user);
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
    });

  return res.status(201).json({ success: true, template: data });
}

async function handleDelete(req, res, user) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Missing id parameter' });
  }

  // Fetch template name for logging
  const { data: template } = await supabaseAdmin
    .from('programme_templates')
    .select('name')
    .eq('id', id)
    .single();

  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }

  const { error } = await supabaseAdmin
    .from('programme_templates')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Template delete error:', error);
    return res.status(500).json({ error: 'Failed to delete template' });
  }

  // Log activity
  await supabaseAdmin
    .from('activity_log')
    .insert({
      action: 'template_deleted',
      details: `Deleted template "${template.name}"`,
      user_display: user.email,
    });

  return res.status(200).json({ success: true });
}

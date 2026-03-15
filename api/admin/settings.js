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
      case 'PUT':
        return await handlePut(req, res, user);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    console.error('Settings API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleGet(res) {
  const { data, error } = await supabaseAdmin
    .from('settings')
    .select('*')
    .single();

  if (error) {
    // If no settings row exists yet, return defaults
    if (error.code === 'PGRST116') {
      return res.status(200).json({
        settings: {
          resort_name: 'TheLifeCo',
          whatsapp_number: '',
        },
      });
    }
    return res.status(500).json({ error: 'Failed to fetch settings' });
  }

  return res.status(200).json({ settings: data });
}

async function handlePut(req, res, user) {
  const updates = req.body || {};

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  // Input validation for freetext fields
  const validationRules = {
    resortName: 200,
    whatsappNumber: 20,
    welcomeMsg: 2000,
    portalBaseUrl: 500,
  };

  for (const [field, maxLen] of Object.entries(validationRules)) {
    if (updates[field] !== undefined && updates[field] !== null && !validateString(updates[field], maxLen)) {
      return res.status(400).json({ error: `${field} must be a string up to ${maxLen} characters` });
    }
  }

  // Map camelCase to snake_case
  const fieldMap = {
    resortName: 'resort_name',
    whatsappNumber: 'whatsapp_number',
    autoPin: 'auto_pin',
    welcomeMsg: 'welcome_msg',
    guestFeedback: 'guest_feedback',
    sessionTimeout: 'session_timeout',
    portalBaseUrl: 'portal_base_url',
    defaultDuration: 'default_duration',
  };

  const dbUpdates = {};
  for (const [key, value] of Object.entries(updates)) {
    if (fieldMap[key]) {
      dbUpdates[fieldMap[key]] = value;
    }
  }

  dbUpdates.updated_at = new Date().toISOString();

  // Check if settings row exists
  const { data: existing } = await supabaseAdmin
    .from('settings')
    .select('id')
    .single();

  let data, error;

  if (existing) {
    // Update existing row
    ({ data, error } = await supabaseAdmin
      .from('settings')
      .update(dbUpdates)
      .eq('id', existing.id)
      .select()
      .single());
  } else {
    // Insert first settings row
    ({ data, error } = await supabaseAdmin
      .from('settings')
      .insert(dbUpdates)
      .select()
      .single());
  }

  if (error) {
    console.error('Settings update error:', error);
    return res.status(500).json({ error: 'Failed to update settings' });
  }

  // Log activity
  await supabaseAdmin
    .from('activity_log')
    .insert({
      action: 'settings_updated',
      details: `Updated settings: ${Object.keys(updates).join(', ')}`,
      user_display: user.email,
    })
    .catch(err => console.error('Activity log error:', err));

  return res.status(200).json({ success: true, settings: data });
}

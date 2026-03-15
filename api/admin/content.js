import { supabaseAdmin, handleCors, requireAuth } from '../_lib/supabase.js';

function validateString(val, maxLen = 500) {
  return typeof val === 'string' && val.length <= maxLen;
}

// Supported content types and their table names
const CONTENT_TABLES = {
  therapies: 'therapies',
  categories: 'therapy_categories',
  hydration: 'hydration_items',
  nutrition: 'nutrition_plans',
  info: 'info_content',
  descriptions: 'activity_descriptions',
  staff: 'staff',
};

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const contentType = req.query.type;
  if (!contentType || !CONTENT_TABLES[contentType]) {
    return res.status(400).json({
      error: 'Missing or invalid content type. Valid types: ' + Object.keys(CONTENT_TABLES).join(', '),
    });
  }

  const table = CONTENT_TABLES[contentType];
  const id = req.query.id;

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(table, contentType, res);
      case 'POST':
        return await handleCreate(table, contentType, req, res, user);
      case 'PUT':
        if (!id) return res.status(400).json({ error: 'Missing id for update' });
        return await handleUpdate(table, contentType, id, req, res, user);
      case 'DELETE':
        if (!id) return res.status(400).json({ error: 'Missing id for delete' });
        return await handleDelete(table, contentType, id, res, user);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) {
    console.error('Content API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleGet(table, contentType, res) {
  const orderCol = ['therapies', 'hydration', 'nutrition', 'categories'].includes(contentType)
    ? 'sort_order'
    : 'id';

  const { data, error } = await supabaseAdmin
    .from(table)
    .select('*')
    .order(orderCol, { ascending: true });

  if (error) {
    console.error(`Content GET error (${contentType}):`, error);
    return res.status(500).json({ error: `Failed to fetch ${contentType}` });
  }

  return res.status(200).json({ [contentType]: data || [] });
}

async function handleCreate(table, contentType, req, res, user) {
  const body = req.body || {};

  // Validate based on content type
  const validation = validateBody(contentType, body);
  if (validation) return res.status(400).json({ error: validation });

  const row = mapToDbRow(contentType, body);

  const { data, error } = await supabaseAdmin
    .from(table)
    .insert(row)
    .select()
    .single();

  if (error) {
    console.error(`Content CREATE error (${contentType}):`, error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Duplicate entry' });
    }
    return res.status(500).json({ error: `Failed to create ${contentType} entry` });
  }

  await logActivity(user, `${contentType}_created`, `Created ${contentType}: ${body.name || body.title || body.sectionKey || 'item'}`);

  return res.status(201).json({ success: true, item: data });
}

async function handleUpdate(table, contentType, id, req, res, user) {
  const body = req.body || {};

  if (Object.keys(body).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  const row = mapToDbRow(contentType, body);

  const { data, error } = await supabaseAdmin
    .from(table)
    .update(row)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error(`Content UPDATE error (${contentType}):`, error);
    return res.status(500).json({ error: `Failed to update ${contentType} entry` });
  }

  if (!data) return res.status(404).json({ error: 'Item not found' });

  await logActivity(user, `${contentType}_updated`, `Updated ${contentType}: ${body.name || body.title || id}`);

  return res.status(200).json({ success: true, item: data });
}

async function handleDelete(table, contentType, id, res, user) {
  // Get item name before deletion for logging
  const { data: existing } = await supabaseAdmin
    .from(table)
    .select('*')
    .eq('id', id)
    .single();

  if (!existing) return res.status(404).json({ error: 'Item not found' });

  const { error } = await supabaseAdmin
    .from(table)
    .delete()
    .eq('id', id);

  if (error) {
    console.error(`Content DELETE error (${contentType}):`, error);
    return res.status(500).json({ error: `Failed to delete ${contentType} entry` });
  }

  const itemName = existing.name || existing.title || existing.section_key || id;
  await logActivity(user, `${contentType}_deleted`, `Deleted ${contentType}: ${itemName}`);

  return res.status(200).json({ success: true });
}

function validateBody(contentType, body) {
  switch (contentType) {
    case 'therapies':
      if (!body.name) return 'Missing required field: name';
      if (!body.categoryId) return 'Missing required field: categoryId';
      if (!validateString(body.name, 200)) return 'name must be up to 200 characters';
      break;
    case 'categories':
      if (!body.id) return 'Missing required field: id';
      if (!body.title) return 'Missing required field: title';
      if (!validateString(body.id, 50)) return 'id must be up to 50 characters';
      if (!validateString(body.title, 200)) return 'title must be up to 200 characters';
      break;
    case 'hydration':
      if (!body.time || !body.name) return 'Missing required fields: time, name';
      break;
    case 'nutrition':
      if (!body.name) return 'Missing required field: name';
      if (!validateString(body.name, 200)) return 'name must be up to 200 characters';
      break;
    case 'info':
      if (!body.sectionKey) return 'Missing required field: sectionKey';
      if (!body.content) return 'Missing required field: content';
      break;
    case 'descriptions':
      if (!body.name) return 'Missing required field: name';
      if (!body.description) return 'Missing required field: description';
      break;
    case 'staff':
      if (!body.displayName) return 'Missing required field: displayName';
      break;
  }
  return null;
}

function mapToDbRow(contentType, body) {
  switch (contentType) {
    case 'therapies':
      return filterUndefined({
        category_id: body.categoryId,
        name: body.name,
        description: body.description,
        image_url: body.imageUrl,
        price_usd: body.priceUsd,
        duration: body.duration,
        is_popular: body.isPopular,
        is_recommended: body.isRecommended,
        sort_order: body.sortOrder,
      });
    case 'categories':
      return filterUndefined({
        id: body.id,
        title: body.title,
        image_path: body.imagePath,
        sort_order: body.sortOrder,
      });
    case 'hydration':
      return filterUndefined({
        time: body.time,
        name: body.name,
        icon: body.icon,
        note: body.note,
        sort_order: body.sortOrder,
      });
    case 'nutrition':
      return filterUndefined({
        name: body.name,
        calories: body.calories,
        description: body.description,
        sort_order: body.sortOrder,
      });
    case 'info':
      return filterUndefined({
        section_key: body.sectionKey,
        content: body.content,
        updated_at: new Date().toISOString(),
      });
    case 'descriptions':
      return filterUndefined({
        name: body.name,
        description: body.description,
        default_type: body.defaultType,
      });
    case 'staff':
      return filterUndefined({
        display_name: body.displayName,
        role: body.role,
      });
    default:
      return body;
  }
}

function filterUndefined(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}

async function logActivity(user, action, details) {
  await supabaseAdmin.from('activity_log').insert({
    action,
    details,
    user_display: user.email,
  }).catch(err => console.error('Activity log error:', err));
}

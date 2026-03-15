import { supabaseAdmin, handleCors, requireAuth } from '../../_lib/supabase.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  const user = await requireAuth(req, res);
  if (!user) return;

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing template id' });

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { data: template } = await supabaseAdmin
    .from('programme_templates')
    .select('name')
    .eq('id', id)
    .single();

  if (!template) return res.status(404).json({ error: 'Template not found' });

  const { error } = await supabaseAdmin
    .from('programme_templates')
    .delete()
    .eq('id', id);

  if (error) return res.status(500).json({ error: 'Failed to delete template' });

  await supabaseAdmin.from('activity_log').insert({
    action: 'template_deleted',
    details: `Deleted template "${template.name}"`,
    user_display: user.email,
  });

  return res.status(200).json({ success: true });
}

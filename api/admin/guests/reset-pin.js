import crypto from 'crypto';
import { supabaseAdmin, handleCors, requireAuth } from '../../_lib/supabase.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;
  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const id = req.query.id || (req.body && req.body.id);
  if (!id) return res.status(400).json({ error: 'Missing guest id' });

  // Generate new random PIN
  const pin = String(crypto.randomInt(1000, 10000));
  const pinHash = crypto.createHash('sha256').update(pin).digest('hex');

  // Update guest
  const { data: guest, error } = await supabaseAdmin
    .from('guests')
    .update({ pin_hash: pinHash, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('first_name, last_name')
    .single();

  if (error || !guest) {
    return res.status(404).json({ error: 'Guest not found' });
  }

  // Log activity
  await supabaseAdmin.from('activity_log').insert({
    action: 'pin_reset',
    details: `Reset PIN for ${guest.first_name} ${guest.last_name}`,
    user_display: user.email,
    guest_id: id,
  }).catch(err => console.error('Activity log error:', err));

  return res.status(200).json({ success: true, pin: pin });
}

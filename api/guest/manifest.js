import { handleCors } from '../_lib/supabase.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { slug } = req.query;

  if (!slug) {
    return res.status(400).json({ error: 'Missing slug parameter' });
  }

  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(slug)) {
    return res.status(400).json({ error: 'Invalid slug format' });
  }

  const manifest = {
    name: 'TheLifeCo \u00b7 Guest Portal',
    short_name: 'TheLifeCo',
    description: 'Your personalized wellness retreat companion',
    start_url: `/guest/${slug}/`,
    display: 'standalone',
    background_color: '#FAF9F6',
    theme_color: '#00609C',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };

  res.setHeader('Content-Type', 'application/manifest+json');
  return res.status(200).json(manifest);
}

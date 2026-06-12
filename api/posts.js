// api/posts.js — список постов для админки
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const tab = req.query.tab || 'pending';
  const statusMap = {
    pending: ['pending'],
    scheduled: ['scheduled'],
    sent: ['sent', 'rejected'],
  };
  const statuses = statusMap[tab] || ['pending'];

  const { data, error } = await sb
    .from('neva_posts')
    .select('*')
    .in('status', statuses)
    .order('created_at', { ascending: tab !== 'pending' });

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ posts: data });
}

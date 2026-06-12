// api/approve.js — одобряет пост, сохраняет расписание, уведомляет пользователя
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { post_id, caption, schedule } = req.body;
  if (!post_id || !schedule?.length) return res.status(400).json({ error: 'Missing fields' });

  // Load post
  const { data: post, error: fetchErr } = await sb.from('neva_posts').select('*').eq('id', post_id).single();
  if (fetchErr || !post) return res.status(404).json({ error: 'Post not found' });

  // Update photos with scheduled_at times
  const updatedPhotos = post.photos.map((ph, i) => ({
    ...ph,
    scheduled_at: schedule[i] || schedule[schedule.length - 1] || null
  }));

  // Save
  const { error: updErr } = await sb.from('neva_posts').update({
    status: 'scheduled',
    caption,
    photos: updatedPhotos,
    approved_at: new Date().toISOString(),
  }).eq('id', post_id);

  if (updErr) return res.status(500).json({ error: updErr.message });

  // Notify user in Telegram
  if (BOT_TOKEN && post.tg_user_id && post.tg_user_id !== '0') {
    const firstSend = schedule[0] ? new Date(schedule[0]).toLocaleString('ru-RU') : '—';
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: post.tg_user_id,
        text: `✅ Твой пост одобрен!\n\n📅 Первое фото выйдет: ${firstSend}\n\n#nevastick`,
      })
    });
  }

  return res.status(200).json({ ok: true });
}

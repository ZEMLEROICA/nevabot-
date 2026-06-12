// api/reject.js
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).end();

  const { post_id } = req.body;
  const { data: post } = await sb.from('neva_posts').select('tg_user_id').eq('id', post_id).single();

  await sb.from('neva_posts').update({ status: 'rejected' }).eq('id', post_id);

  if (BOT_TOKEN && post?.tg_user_id && post.tg_user_id !== '0') {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: post.tg_user_id,
        text: '❌ К сожалению, твой пост не прошёл модерацию.\n\nМожешь попробовать отправить другое фото.',
      })
    });
  }

  return res.status(200).json({ ok: true });
}

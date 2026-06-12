// api/cron.js — планировщик, вызывается каждую минуту через Vercel Cron
// Vercel Cron: schedule "* * * * *" (каждую минуту) — в vercel.json
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID; // @nevasticker или -100xxxxxxxxx

export default async function handler(req, res) {
  // Vercel Cron sends GET with Authorization header
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = new Date().toISOString();

  // Find all scheduled posts where any photo's scheduled_at <= now
  const { data: posts } = await sb
    .from('neva_posts')
    .select('*')
    .eq('status', 'scheduled');

  if (!posts?.length) return res.status(200).json({ sent: 0 });

  let sentCount = 0;

  for (const post of posts) {
    const photos = post.photos || [];
    let anyUpdated = false;

    for (let i = 0; i < photos.length; i++) {
      const ph = photos[i];
      if (ph.sent_at || !ph.scheduled_at) continue;
      if (ph.scheduled_at > now) continue;

      // Send this photo to channel
      try {
        const caption = buildCaption(post, ph, i, photos.length);
        const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: CHANNEL_ID,
            photo: ph.url,
            caption,
            parse_mode: 'HTML',
          })
        });
        const tgData = await tgRes.json();
        if (!tgData.ok) throw new Error(tgData.description);

        photos[i] = { ...ph, sent_at: now, tg_message_id: tgData.result?.message_id };
        anyUpdated = true;
        sentCount++;
      } catch (e) {
        console.error('Send error for post', post.id, 'photo', i, e.message);
      }
    }

    if (anyUpdated) {
      // Check if all photos sent
      const allSent = photos.every(p => p.sent_at || !p.scheduled_at);
      await sb.from('neva_posts').update({
        photos,
        status: allSent ? 'sent' : 'scheduled',
        ...(allSent ? { sent_at: now } : {}),
      }).eq('id', post.id);
    }
  }

  return res.status(200).json({ sent: sentCount, checked: posts.length });
}

function buildCaption(post, ph, photoIndex, totalPhotos) {
  // Use custom caption if set, otherwise build default
  let text = post.caption || '';

  if (!text) {
    if (post.comment) text += post.comment + '\n\n';
    text += `📍 <b>${post.location}</b>\n`;
    if (post.channel) text += `👤 ${post.channel}\n`;
    text += '\n<b>#nevastick</b> #streetart #spb #graffiti';
  }

  // Add photo index if multiple
  if (totalPhotos > 1) text += `\n\n<i>${photoIndex + 1}/${totalPhotos}</i>`;

  return text;
}

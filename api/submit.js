// api/submit.js — принимает фото от пользователя, сохраняет в Supabase Storage + DB
import { createClient } from '@supabase/supabase-js';
import { IncomingForm } from 'formidable';
import fs from 'fs';

export const config = { api: { bodyParser: false } };

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID; // твой Telegram ID для уведомлений

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');

  const form = new IncomingForm({ maxFileSize: 20 * 1024 * 1024, multiples: true });

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(400).json({ error: 'Ошибка загрузки файлов' });

    try {
      const tgUserId = String(fields.tg_user_id?.[0] || fields.tg_user_id || '0');
      const tgUsername = String(fields.tg_username?.[0] || fields.tg_username || '');
      const channel = String(fields.channel?.[0] || fields.channel || '');
      const location = String(fields.location?.[0] || fields.location || '');
      const comment = String(fields.comment?.[0] || fields.comment || '');
      const photoCount = parseInt(fields.photo_count?.[0] || fields.photo_count || '0');

      // Upload each photo to Supabase Storage
      const photoUrls = [];
      for (let i = 0; i < photoCount; i++) {
        const fileObj = files[`photo_${i}`];
        if (!fileObj) continue;
        const file = Array.isArray(fileObj) ? fileObj[0] : fileObj;
        const buf = fs.readFileSync(file.filepath);
        const fileName = `posts/${Date.now()}_${i}.jpg`;

        const { error: upErr } = await sb.storage.from('neva-photos').upload(fileName, buf, {
          contentType: 'image/jpeg', upsert: false
        });
        if (upErr) throw new Error('Storage error: ' + upErr.message);

        const { data: { publicUrl } } = sb.storage.from('neva-photos').getPublicUrl(fileName);
        photoUrls.push({ url: publicUrl, storage_path: fileName, scheduled_at: null });
      }

      if (!photoUrls.length) return res.status(400).json({ error: 'Нет фото' });

      // Save post to DB
      const { data: post, error: dbErr } = await sb.from('neva_posts').insert({
        tg_user_id: tgUserId,
        tg_username: tgUsername,
        channel,
        location,
        comment,
        photos: photoUrls,
        status: 'pending',
        caption: null,
        created_at: new Date().toISOString(),
      }).select().single();

      if (dbErr) throw new Error('DB error: ' + dbErr.message);

      // Notify admin via Telegram
      if (BOT_TOKEN && ADMIN_CHAT_ID) {
        const msg = `🎨 Новый пост на модерацию!\n\n` +
          `👤 @${tgUsername} (${tgUserId})\n` +
          `📡 ${channel}\n📍 ${location}\n` +
          `🖼 Фото: ${photoUrls.length}\n` +
          (comment ? `💬 "${comment}"\n` : '') +
          `\nID: ${post.id}`;

        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: ADMIN_CHAT_ID,
            photo: photoUrls[0].url,
            caption: msg,
          })
        });
      }

      return res.status(200).json({ ok: true, post_id: post.id });
    } catch (e) {
      console.error('submit error:', e);
      return res.status(500).json({ error: e.message });
    }
  });
}

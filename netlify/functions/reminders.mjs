// Daily at about 8am in WANDERLUST_TIMEZONE (default Australia/Melbourne; set it to yours): notify subscribed devices of key dates due today or tomorrow.
import { getStore } from '@netlify/blobs';
import webpush from 'web-push';
import { internals } from '../../dist/netlify-server/index.mjs';
import { netlifyBucket } from '../../server/netlify-bucket.mjs';
const melDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: process.env.WANDERLUST_TIMEZONE || 'Australia/Melbourne' }).format(d);
export default async () => {
  const { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv } = process.env; if (!pub || !priv) return new Response('not configured');
  webpush.setVapidDetails('mailto:noreply@wanderlust.invalid', pub, priv);
  const env = { BUCKET: netlifyBucket(getStore({ name: 'elsewhere', consistency: 'strong' })) };
  const subs = (await internals.readJSON(env, 'push/subscriptions.json'))?.body?.subs || []; if (!subs.length) return new Response('no devices');
  const { docs } = await internals.loadSyncDocs(env), today = melDate(), tomorrow = melDate(new Date(Date.now() + 864e5));
  const due = internals.keyDates(docs).filter(e => e.date === today || e.date === tomorrow);
  const keep = [];
  for (const s of subs) { let ok = true; for (const e of due) { try { await webpush.sendNotification(s, JSON.stringify({ title: (e.date === today ? 'Today: ' : 'Tomorrow: ') + e.summary, body: e.desc || '', url: '/plan?zoom=month&m=' + e.date.slice(0, 7) })); } catch (x) { if (x.statusCode === 404 || x.statusCode === 410) ok = false; } } if (ok) keep.push(s); }
  if (keep.length !== subs.length) await env.BUCKET.put('push/subscriptions.json', JSON.stringify({ subs: keep }), { httpMetadata: { contentType: 'application/json' } });
  return new Response('sent ' + due.length + ' to ' + keep.length);
};
export const config = { schedule: '0 21 * * *' };

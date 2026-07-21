import mysql from 'mysql2/promise';
import { resolveNotificationTemplate } from './template-payload.mjs';

const pool = mysql.createPool({ host: process.env.MYSQL_HOST || 'mysql', port: Number(process.env.MYSQL_PORT || 3306), database: process.env.MYSQL_DATABASE, user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, connectionLimit: 3, timezone: 'Z' });
const mode = process.env.WECHAT_MODE || 'mock';
let tokenCache = null;

async function accessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.value;
  const url = new URL('https://api.weixin.qq.com/cgi-bin/token'); url.searchParams.set('grant_type', 'client_credential'); url.searchParams.set('appid', process.env.WX_APPID || ''); url.searchParams.set('secret', process.env.WX_SECRET || '');
  const response = await fetch(url); const body = await response.json();
  if (!response.ok || !body.access_token) throw new Error(`WeChat token failed: ${body.errcode ?? 'unknown'}`);
  tokenCache = { value: body.access_token, expiresAt: Date.now() + Number(body.expires_in || 7200) * 1000 }; return tokenCache.value;
}

async function deliver(row) {
  const payload = typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : (row.payload_json || {});
  if (mode === 'mock') return 'sent';
  const template = resolveNotificationTemplate(row.event_type, payload);
  if (!template) return 'skipped';
  if (!row.openid) throw new Error('Production notification requires openid');
  const response = await fetch(`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${await accessToken()}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ touser: row.openid, template_id: template.templateId, page: template.page, data: template.data }) });
  const body = await response.json(); if (!response.ok || body.errcode) throw new Error(`WeChat notification failed: ${body.errcode ?? 'unknown'}`);
  return 'sent';
}

async function runOnce() {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query("select n.id, n.event_type, n.recipient_user_id, n.payload_json, u.openid from notification_outbox n join users u on u.id = n.recipient_user_id where n.status = 'pending' and n.available_at <= current_timestamp(3) order by n.created_at limit 20 for update skip locked");
    for (const row of rows) {
      try {
        await connection.query("update notification_outbox set status='sending', attempts=attempts+1 where id=?", [row.id]);
        const result = await deliver(row);
        if (result === 'skipped') await connection.query("update notification_outbox set status='skipped', last_error=? where id=?", ['No approved WeChat template for event type', row.id]);
        else await connection.query("update notification_outbox set status='sent', sent_at=current_timestamp(3) where id=?", [row.id]);
      } catch (error) {
        await connection.query("update notification_outbox set status='pending', available_at=date_add(current_timestamp(3), interval least(attempts * 30, 900) second), last_error=? where id=?", [String(error).slice(0, 1000), row.id]);
      }
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    console.error(JSON.stringify({ worker: 'notification', error: String(error) }));
  } finally { connection.release(); }
}

setInterval(runOnce, 3000);
await runOnce();

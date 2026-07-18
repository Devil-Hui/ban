// utils/format.js — 时间/日期格式化（兼容 iOS 的 - 转 /）
function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function toDate(s) {
  if (!s) return null;
  let str = String(s);
  // 兼容 Safari：'2026-07-10T12:00:00' -> '2026/07/10T12:00:00'
  if (str.indexOf('-') >= 0) str = str.replace(/-/g, '/');
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function fmtDate(s) {
  const d = toDate(s);
  if (!d) return '—';
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtDateTime(s) {
  const d = toDate(s);
  if (!d) return '—';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function weekday(s) {
  const d = toDate(s);
  return d ? WEEK[d.getDay()] : '';
}

function fromNow(s) {
  const d = toDate(s);
  if (!d) return '';
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return min + ' 分钟前';
  const h = Math.floor(min / 60);
  if (h < 24) return h + ' 小时前';
  const day = Math.floor(h / 24);
  if (day < 30) return day + ' 天前';
  return fmtDate(s);
}

module.exports = { pad, toDate, fmtDate, fmtDateTime, weekday, fromNow };

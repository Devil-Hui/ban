/**
 * Shared wall-clock formatters for campus scheduling UI.
 * Prefer extracting HH:mm from ISO payload to avoid local TZ shift on Z timestamps.
 */

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatYmd(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  const raw = String(value).trim();
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime()) && d.getFullYear() >= 2020) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  return raw.slice(0, 10);
}

function formatHm(value) {
  if (!value) return '';
  const raw = String(value).trim();
  const m = raw.match(/T(\d{2}):(\d{2})/) || raw.match(/\s(\d{2}):(\d{2})/);
  if (m) return `${m[1]}:${m[2]}`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

function formatRange(startsAt, endsAt) {
  const a = formatHm(startsAt);
  const b = formatHm(endsAt);
  if (a && b) return `${a}-${b}`;
  return a || b || '';
}

function formatSlotLabel(slot) {
  if (!slot) return '';
  const date = formatYmd(slot.slotDate || slot.date);
  const range = formatRange(slot.startsAt, slot.endsAt);
  if (date && range) return `${date} ${range}`;
  return date || range || '';
}

/** Asia/Shanghai (+08) wall clock for deadlines stored as UTC Instant. */
function formatDeadline(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const raw = String(value).trim();
    const m = raw.match(/(\d{4}-\d{2}-\d{2})[T\s](\d{2}):(\d{2})/);
    return m ? `${m[1]} ${m[2]}:${m[3]}` : raw;
  }
  const local = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return `${local.getUTCFullYear()}-${pad2(local.getUTCMonth() + 1)}-${pad2(local.getUTCDate())} ${pad2(local.getUTCHours())}:${pad2(local.getUTCMinutes())}`;
}

/** Inclusive max days for a scheduling task (product: one week). */
const MAX_TASK_SPAN_DAYS = 7;

function addDaysYmd(ymd, days) {
  const base = formatYmd(ymd);
  if (!base) return '';
  const d = new Date(`${base}T00:00:00`);
  if (Number.isNaN(d.getTime())) return base;
  d.setDate(d.getDate() + Number(days || 0));
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function inclusiveDaySpan(dateStart, dateEnd) {
  const start = formatYmd(dateStart);
  const end = formatYmd(dateEnd) || start;
  if (!start || !end) return 0;
  const a = new Date(`${start}T00:00:00`).getTime();
  const b = new Date(`${end}T00:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return 0;
  return Math.floor((b - a) / 86_400_000) + 1;
}

function enumerateDates(dateStart, dateEnd, maxDays = MAX_TASK_SPAN_DAYS) {
  const start = formatYmd(dateStart);
  let end = formatYmd(dateEnd) || start;
  if (!start) return [];
  const cap = Math.max(1, Math.min(62, Number(maxDays) || MAX_TASK_SPAN_DAYS));
  // Clamp end to start+(cap-1) for task grids
  const maxEnd = addDaysYmd(start, cap - 1);
  if (end > maxEnd) end = maxEnd;
  const out = [];
  const cur = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(last.getTime())) return [start];
  while (cur.getTime() <= last.getTime()) {
    out.push(`${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}-${pad2(cur.getDate())}`);
    cur.setDate(cur.getDate() + 1);
    if (out.length >= cap) break;
  }
  return out.length ? out : [start];
}

/** Local "today" as YYYY-MM-DD (device clock), used by week shortcuts. */
function localTodayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Monday of the week containing ymd (Monday is the first day of the week).
 * @param {string} ymd 'YYYY-MM-DD'
 * @returns {string} Monday as 'YYYY-MM-DD' ('' if invalid)
 */
function mondayOfYmd(ymd) {
  const base = formatYmd(ymd);
  if (!base) return '';
  const d = new Date(`${base}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const dow = d.getDay(); // 0=Sun .. 6=Sat
  const back = dow === 0 ? -6 : 1 - dow;
  return addDaysYmd(base, back);
}

/**
 * Inclusive natural week (Mon~Sun) for the given ymd.
 * @returns {{start:string, end:string}} always 7 days (== MAX_TASK_SPAN_DAYS)
 */
function weekRange(ymd) {
  const mon = mondayOfYmd(ymd);
  if (!mon) return { start: '', end: '' };
  return { start: mon, end: addDaysYmd(mon, 6) };
}

/** This week (Mon~Sun) based on today. */
function thisWeekRange() {
  return weekRange(localTodayYmd());
}

/** Next week (Mon~Sun) relative to the given ymd (defaults to today). */
function nextWeekRange(ymd) {
  const mon = mondayOfYmd(ymd || localTodayYmd());
  if (!mon) return { start: '', end: '' };
  const nextMon = addDaysYmd(mon, 7);
  return { start: nextMon, end: addDaysYmd(nextMon, 6) };
}

module.exports = {
  pad2,
  formatYmd,
  formatHm,
  formatRange,
  formatSlotLabel,
  formatDeadline,
  enumerateDates,
  addDaysYmd,
  inclusiveDaySpan,
  MAX_TASK_SPAN_DAYS,
  mondayOfYmd,
  weekRange,
  thisWeekRange,
  nextWeekRange,
};

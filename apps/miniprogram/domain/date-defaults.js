/**
 * Local calendar date helpers for campus task-create defaults.
 * Assumption: Asia/Shanghai (+08:00) campus timezone; uses local Y/M/D of `now`
 * (device local clock), then formats deadline with fixed +08:00 offset to match
 * existing task-create pattern (`YYYY-MM-DDT23:59:00.000+08:00`).
 */

function pad2(n) {
  return String(n).padStart(2, '0');
}

function todayYmd(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function defaultDeadlineIso(now = new Date()) {
  return `${todayYmd(now)}T23:59:00.000+08:00`;
}

module.exports = { todayYmd, defaultDeadlineIso };

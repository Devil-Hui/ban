/** @returns {number|null} minutes before deadline to remind; null = skip reminders */
export function resolveRemindBeforeMinutes(rulesJson) {
  if (rulesJson == null || rulesJson === '') return 30; // legacy default when rules_json is SQL NULL / empty
  let rules = rulesJson;
  if (typeof rulesJson === 'string') {
    try {
      rules = JSON.parse(rulesJson);
    } catch {
      return 30;
    }
  }
  if (!rules || typeof rules !== 'object') return 30;
  if (!Object.prototype.hasOwnProperty.call(rules, 'remindBeforeMinutes')) return 30;
  if (rules.remindBeforeMinutes === null) return null; // explicit disable
  const minutes = Number(rules.remindBeforeMinutes);
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  return Math.floor(minutes);
}

/** @returns {boolean} whether now is inside [deadline - remindMinutes, deadline) */
export function isWithinRemindWindow(deadline, remindMinutes, now = new Date()) {
  if (remindMinutes == null) return false;
  const deadlineMs = new Date(deadline).getTime();
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(deadlineMs) || !Number.isFinite(nowMs)) return false;
  if (nowMs >= deadlineMs) return false; // past / at deadline: closing path handles status
  const windowStartMs = deadlineMs - remindMinutes * 60_000;
  return nowMs >= windowStartMs;
}

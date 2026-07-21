/**
 * Slot selection keys and people-count paint brush helpers.
 * Key format: `${date}|${periodCode}` e.g. `2026-10-01|p3`
 */

function slotKey(date, periodCode) {
  return `${date}|${periodCode}`;
}

function parseSlotKey(key) {
  const raw = String(key || '');
  const i = raw.indexOf('|');
  if (i < 0) {
    return { date: raw, periodCode: '' };
  }
  return {
    date: raw.slice(0, i),
    periodCode: raw.slice(i + 1),
  };
}

/**
 * @param {Record<string, number>|null|undefined} peopleByKey
 * @param {string} key
 * @param {number|'erase'|null|undefined} tool
 * @returns {Record<string, number>}
 */
function applyPaint(peopleByKey, key, tool) {
  const next = { ...(peopleByKey || {}) };
  if (tool === 'erase' || tool == null) {
    delete next[key];
    return next;
  }
  if (Number.isInteger(tool) && tool >= 1) {
    next[key] = tool;
  }
  return next;
}

module.exports = { slotKey, parseSlotKey, applyPaint };

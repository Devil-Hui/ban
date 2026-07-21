/**
 * Pure helpers for schedule-grid (node:testable).
 * Rectangular multi-row drag is deferred; only row-contiguous range is supported.
 */
const { slotKey } = require('../../domain/slot-selection');

/**
 * Toggle a single key in the selected list.
 * @param {string[]} keys
 * @param {string} key
 * @returns {string[]}
 */
function toggleKey(keys, key) {
  const list = Array.isArray(keys) ? keys.slice() : [];
  const i = list.indexOf(key);
  if (i >= 0) list.splice(i, 1);
  else list.push(key);
  return list;
}

/**
 * Apply add/remove across contiguous date indices on one period row.
 * @param {string[]} keys
 * @param {string[]} dates
 * @param {string} periodCode
 * @param {number} fromIndex
 * @param {number} toIndex
 * @param {boolean} adding
 * @returns {string[]}
 */
function applyRowRange(keys, dates, periodCode, fromIndex, toIndex, adding) {
  const set = new Set(Array.isArray(keys) ? keys : []);
  if (!Array.isArray(dates) || !dates.length || !periodCode) {
    return Array.from(set);
  }
  const lo = Math.max(0, Math.min(Number(fromIndex), Number(toIndex)));
  const hi = Math.min(dates.length - 1, Math.max(Number(fromIndex), Number(toIndex)));
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) {
    return Array.from(set);
  }
  for (let i = lo; i <= hi; i += 1) {
    const key = slotKey(dates[i], periodCode);
    if (adding) set.add(key);
    else set.delete(key);
  }
  return Array.from(set);
}

/**
 * @param {'readonly'|'select'|'paint'|string} mode
 * @param {string} key
 * @param {string[]} selectedKeys
 */
function isCellInteractive(mode, key, selectedKeys) {
  if (mode === 'readonly' || !mode) return false;
  if (mode === 'select') return true;
  if (mode === 'paint' || mode === 'staff') {
    return Array.isArray(selectedKeys) && selectedKeys.indexOf(key) >= 0;
  }
  return false;
}

/**
 * Map horizontal offset within a row to a date column index.
 * @param {number} offsetX distance from row left edge
 * @param {number} totalWidth row width
 * @param {number} count number of date columns
 * @param {number} labelWidth left period-label column width
 * @returns {number} index or -1
 */
function indexFromOffset(offsetX, totalWidth, count, labelWidth) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return -1;
  const usable = Number(totalWidth) - Number(labelWidth || 0);
  if (!Number.isFinite(usable) || usable <= 0) return -1;
  const x = Number(offsetX) - Number(labelWidth || 0);
  if (!Number.isFinite(x) || x < 0) return -1;
  const idx = Math.floor((x / usable) * n);
  if (idx < 0) return -1;
  if (idx >= n) return n - 1;
  return idx;
}

/**
 * Short date header: YYYY-MM-DD → MM-DD
 * @param {string} ymd
 */
function formatDateHeader(ymd) {
  const raw = String(ymd || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(5);
  return raw;
}

module.exports = {
  slotKey,
  toggleKey,
  applyRowRange,
  isCellInteractive,
  indexFromOffset,
  formatDateHeader,
};

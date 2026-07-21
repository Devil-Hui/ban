/**
 * Period skeleton builder for task-create wizard Step 2.
 * Pure domain: preset + tweaks → periods[] (no wx).
 */
const { TIME_MODES, DEFAULT_TASK_TIME_MODE } = require('../constants/time-modes');

const PRESET_DEFAULTS = {
  start0800_45: {
    firstStart: '08:00',
    durationMin: 45,
    morningCount: 4,
    afternoonCount: 4,
    eveningCount: 0,
    breakMin: 10,
  },
  start0830_45: {
    firstStart: '08:30',
    durationMin: 45,
    morningCount: 4,
    afternoonCount: 4,
    eveningCount: 0,
    breakMin: 10,
  },
  manual: {
    firstStart: '08:00',
    durationMin: 45,
    morningCount: 4,
    afternoonCount: 4,
    eveningCount: 0,
    breakMin: 10,
  },
};

/**
 * Resolve multi-select display options into a single timeMode string.
 * - custom alone, or range+section → section_range
 * - only range → range
 * - only section → section
 * - none → section_range (default)
 */
function resolveTimeMode(selected = {}) {
  const range = !!selected.range;
  const section = !!selected.section;
  const custom = !!selected.custom;

  if (custom || (range && section)) return TIME_MODES.SECTION_RANGE;
  if (range) return TIME_MODES.RANGE;
  if (section) return TIME_MODES.SECTION;
  return DEFAULT_TASK_TIME_MODE;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseHhmm(value, fallbackMinute) {
  const raw = String(value == null ? '' : value).trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!m) return fallbackMinute;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min) || h < 0 || h > 23 || min < 0 || min > 59) {
    return fallbackMinute;
  }
  return h * 60 + min;
}

function minuteToHhmm(minute) {
  const m = ((Number(minute) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${pad2(h)}:${pad2(min)}`;
}

function toNonNegInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function toPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

/**
 * @param {{ preset?: 'start0800_45'|'start0830_45'|'manual', tweaks?: object }} opts
 * @returns {Array<{code,label,startMinute,endMinute,minPeople,targetPeople,maxPeople}>}
 */
function buildPeriods(opts = {}) {
  const presetKey = PRESET_DEFAULTS[opts.preset] ? opts.preset : 'manual';
  const base = PRESET_DEFAULTS[presetKey];
  const tweaks = opts.tweaks || {};

  const firstStartMinute = parseHhmm(
    tweaks.firstStart != null ? tweaks.firstStart : base.firstStart,
    parseHhmm(base.firstStart, 8 * 60)
  );
  const durationMin = toPositiveInt(
    tweaks.durationMin != null ? tweaks.durationMin : base.durationMin,
    base.durationMin
  );
  const breakMin = toNonNegInt(
    tweaks.breakMin != null ? tweaks.breakMin : base.breakMin,
    base.breakMin
  );
  const morningCount = toNonNegInt(
    tweaks.morningCount != null ? tweaks.morningCount : base.morningCount,
    base.morningCount
  );
  const afternoonCount = toNonNegInt(
    tweaks.afternoonCount != null ? tweaks.afternoonCount : base.afternoonCount,
    base.afternoonCount
  );
  const eveningCount = toNonNegInt(
    tweaks.eveningCount != null ? tweaks.eveningCount : base.eveningCount,
    base.eveningCount
  );

  const total = morningCount + afternoonCount + eveningCount;
  const periods = [];
  let cursor = firstStartMinute;

  for (let i = 1; i <= total; i += 1) {
    const startMinute = cursor;
    const endMinute = startMinute + durationMin;
    const startLabel = minuteToHhmm(startMinute);
    const endLabel = minuteToHhmm(endMinute);
    periods.push({
      code: `p${i}`,
      label: `第${i}节 ${startLabel}-${endLabel}`,
      startMinute,
      endMinute,
      minPeople: 1,
      targetPeople: 1,
      maxPeople: 1,
    });
    cursor = endMinute + breakMin;
  }

  return periods;
}

module.exports = {
  TIME_MODES,
  resolveTimeMode,
  buildPeriods,
};

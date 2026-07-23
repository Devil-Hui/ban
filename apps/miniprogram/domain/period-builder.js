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

  const firstStartMinute = parseHhmm(tweaks.firstStart != null ? tweaks.firstStart : base.firstStart, parseHhmm(base.firstStart, 8 * 60));
  const durationMin = toPositiveInt(tweaks.durationMin != null ? tweaks.durationMin : base.durationMin, base.durationMin);
  const breakMin = toNonNegInt(tweaks.breakMin != null ? tweaks.breakMin : base.breakMin, base.breakMin);
  const bigBreakMin = toNonNegInt(tweaks.bigBreakMin || 0, 0);
  const isBigBreakMode = tweaks.hasBigBreak && bigBreakMin > 0;
  const morningCount = toNonNegInt(tweaks.morningCount != null ? tweaks.morningCount : base.morningCount, base.morningCount);
  const afternoonCount = toNonNegInt(tweaks.afternoonCount != null ? tweaks.afternoonCount : base.afternoonCount, base.afternoonCount);
  const eveningCount = toNonNegInt(tweaks.eveningCount != null ? tweaks.eveningCount : base.eveningCount, base.eveningCount);

  // 午休 / 晚饭 只在用户启用时才生效
  const hasLunch = tweaks.hasLunch && morningCount > 0 && afternoonCount > 0;
  const lunchStartMinute = hasLunch ? parseHhmm(tweaks.lunchStart, 12 * 60) : 0;
  const lunchEndMinute = hasLunch ? parseHhmm(tweaks.lunchEnd, 13 * 60 + 30) : 0;
  const eveningSlots = (tweaks.eveningSlots && tweaks.eveningSlots.length) ? tweaks.eveningSlots : [];

  const periods = [];
  let cursor = firstStartMinute;
  let seq = 1;
  let segPos = 0; // 段内位置，每个时段段(上午/下午/晚上)独立计数

  function pushSeq() {
    segPos += 1;
    if (isBigBreakMode) {
      const isBigGap = segPos % 2 === 0;
      periods.push({
        code: `p${seq}`,
        label: `第${seq}节 待定`,
        timeRange: '待定',
        startMinute: 0,
        endMinute: durationMin,
        minPeople: 1,
        targetPeople: 1,
        maxPeople: 1,
        breakType: isBigGap ? '普通课间' : '上课间休息',
        breakMinute: isBigGap ? bigBreakMin : breakMin,
      });
      seq += 1;
      return;
    }
    const startMinute = cursor;
    const endMinute = startMinute + durationMin;
    const startLabel = minuteToHhmm(startMinute);
    const endLabel = minuteToHhmm(endMinute);
    periods.push({
      code: `p${seq}`,
      label: `第${seq}节 ${startLabel}-${endLabel}`,
      timeRange: `${startLabel}-${endLabel}`,
      startMinute,
      endMinute,
      minPeople: 1,
      targetPeople: 1,
      maxPeople: 1,
    });
    cursor = endMinute + (isBigBreakMode ? 0 : breakMin);
    seq += 1;
  }

  function pushRest(label, startMinute, endMinute) {
    periods.push({
      code: `rest${seq}`,
      label,
      timeRange: `${minuteToHhmm(startMinute)}-${minuteToHhmm(endMinute)}`,
      startMinute,
      endMinute,
      minPeople: 0,
      targetPeople: 0,
      maxPeople: 0,
      rest: true,
    });
  }

  // 上午
  segPos = 0;
  for (let i = 0; i < morningCount; i += 1) pushSeq();

  // 午休
  if (hasLunch) {
    pushRest(`午休 ${minuteToHhmm(lunchStartMinute)}-${minuteToHhmm(lunchEndMinute)}`, lunchStartMinute, lunchEndMinute);
    if (tweaks.lunchBlocked != null ? tweaks.lunchBlocked : true) {
      cursor = lunchEndMinute;
    }
  }

  // 下午
  segPos = 0;
  for (let i = 0; i < afternoonCount; i += 1) pushSeq();

  // 晚上（手动添加，每节有独立的开始/结束时间）
  for (let i = 0; i < eveningSlots.length; i += 1) {
    const slot = eveningSlots[i];
    const startMin = parseHhmm(slot.start, 18 * 60 + 30);
    const endMin = parseHhmm(slot.end, startMin + durationMin);
    periods.push({
      code: `p${seq}`,
      label: `第${seq}节 ${minuteToHhmm(startMin)}-${minuteToHhmm(endMin)}`,
      timeRange: `${minuteToHhmm(startMin)}-${minuteToHhmm(endMin)}`,
      startMinute: startMin,
      endMinute: endMin,
      minPeople: 1,
      targetPeople: 1,
      maxPeople: 1,
    });
    seq += 1;
  }

  return periods;
}

module.exports = {
  TIME_MODES,
  resolveTimeMode,
  buildPeriods,
};

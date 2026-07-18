'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  resolvePeriods,
  TIME_MODES,
  displayLabel,
  normalizeSlots,
  DEFAULT_TASK_TIME_MODE,
} = require('../src/domain/time');

const profile45 = [
  { id: 'p1', name: '第1节', sectionIndex: 1, start: '08:00', end: '08:45', kind: 'hybrid' },
  { id: 'p2', name: '第2节', sectionIndex: 2, start: '08:55', end: '09:40', kind: 'hybrid' },
  { id: 'p3', name: '第3节', sectionIndex: 3, start: '10:00', end: '10:45', kind: 'hybrid' },
];

test('resolvePeriods section：勾选子集并带时间快照', () => {
  const periods = resolvePeriods({
    mode: TIME_MODES.SECTION,
    profileSlots: profile45,
    selectedIds: ['p1', 'p3'],
  });
  assert.strictEqual(periods.length, 2);
  assert.strictEqual(periods[0].id, 'p1');
  assert.strictEqual(periods[0].start, '08:00');
  assert.strictEqual(periods[1].id, 'p3');
});

test('resolvePeriods range：仅自定义时间段', () => {
  const periods = resolvePeriods({
    mode: TIME_MODES.RANGE,
    profileSlots: profile45,
    customRanges: [
      { id: 't1', name: '08:00-10:00', start: '08:00', end: '10:00' },
      { id: 't2', start: '10:00', end: '12:00' },
    ],
  });
  assert.strictEqual(periods.length, 2);
  assert.strictEqual(periods[0].kind, 'range');
  assert.ok(periods[1].name);
});

test('resolvePeriods section_range：允许覆盖单节时间', () => {
  const periods = resolvePeriods({
    mode: TIME_MODES.SECTION_RANGE,
    profileSlots: profile45,
    selectedIds: ['p1', 'p2'],
    timeOverrides: { p2: { start: '09:00', end: '09:50' } },
  });
  assert.strictEqual(periods[1].start, '09:00');
  assert.strictEqual(periods[1].end, '09:50');
  assert.strictEqual(periods[0].start, '08:00');
});

test('resolvePeriods 空结果抛 PERIODS_EMPTY', () => {
  assert.throws(
    () => resolvePeriods({ mode: TIME_MODES.RANGE, profileSlots: [], customRanges: [] }),
    (e) => e.code === 'PERIODS_EMPTY'
  );
});

test('resolvePeriods 非法 mode', () => {
  assert.throws(() => resolvePeriods({ mode: 'foo', profileSlots: profile45 }), (e) => e.code === 'INVALID_TIME_MODE');
});

test('displayLabel 随 mode 变化', () => {
  const slot = { id: 'p1', name: '第1节', start: '08:00', end: '08:45' };
  assert.strictEqual(displayLabel(slot, TIME_MODES.SECTION), '第1节');
  assert.ok(displayLabel(slot, TIME_MODES.SECTION_RANGE).includes('08:00'));
  assert.strictEqual(displayLabel(slot, TIME_MODES.RANGE), '08:00-08:45');
});

test('legacy morning 归一', () => {
  const slots = normalizeSlots(['morning', 'afternoon', 'night']);
  assert.strictEqual(slots.length, 3);
  assert.strictEqual(slots[0].start, '08:00');
});

test('默认 mode 为 section_range', () => {
  assert.strictEqual(DEFAULT_TASK_TIME_MODE, 'section_range');
});

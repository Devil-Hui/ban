const { formatYmd, formatHm, formatSlotLabel, enumerateDates } = require('./time-format');

function buildAssignmentRows(assignments = {}, slots = []) {
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  return Object.entries(assignments).flatMap(([slotId, userIds]) =>
    (userIds || []).map((userId, assignmentIndex) => {
      const slot = slotById.get(slotId);
      return {
        key: `${slotId}:${assignmentIndex}`,
        slotId,
        assignmentIndex,
        userId,
        slotLabel: slot ? formatSlotLabel(slot) : slotId,
        date: slot ? formatYmd(slot.slotDate) : '',
        timeRange: slot ? `${formatHm(slot.startsAt)}-${formatHm(slot.endsAt)}` : '',
      };
    }),
  );
}

function replaceAssignmentMember(candidate, row, userId) {
  const assignments = Object.fromEntries(
    Object.entries(candidate.assignments || {}).map(([slotId, userIds]) => [slotId, [...userIds]]),
  );
  if (!assignments[row.slotId]?.[row.assignmentIndex]) throw new Error('Assignment row not found');
  if (assignments[row.slotId].some((value, index) => index !== row.assignmentIndex && value === userId)) {
    throw new Error('Duplicate member in slot');
  }
  assignments[row.slotId][row.assignmentIndex] = userId;
  return { ...candidate, assignments };
}

/**
 * Build schedule-grid model for a candidate or published assignment list.
 * @param {object} opts
 * @param {object} [opts.assignmentsMap] slotId -> userId[]
 * @param {Array} [opts.assignmentList] [{slotId,userId}]
 * @param {Array} slots
 * @param {string} [highlightUserId]
 * @param {string} [dateStart]
 * @param {string} [dateEnd]
 */
function buildPlanGrid({
  assignmentsMap,
  assignmentList,
  slots = [],
  highlightUserId = '',
  dateStart,
  dateEnd,
} = {}) {
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const pairs = [];
  if (assignmentsMap) {
    Object.entries(assignmentsMap).forEach(([slotId, userIds]) => {
      (userIds || []).forEach((userId) => pairs.push({ slotId, userId }));
    });
  }
  if (assignmentList) {
    assignmentList.forEach((item) => pairs.push({ slotId: item.slotId, userId: item.userId }));
  }

  const usedSlots = pairs.map((p) => slotById.get(p.slotId)).filter(Boolean);
  const allSlots = usedSlots.length ? usedSlots : slots;

  const dateSet = new Set();
  if (dateStart && dateEnd) {
    // full range if provided
    enumerateDates(dateStart, dateEnd).forEach((d) => dateSet.add(d));
  }
  allSlots.forEach((s) => {
    const d = formatYmd(s.slotDate);
    if (d) dateSet.add(d);
  });
  const dates = [...dateSet].sort();

  const periodOrder = [];
  const periodMap = new Map();
  allSlots.forEach((slot) => {
    const code = String(slot.periodId || slot.periodCode || slot.id);
    if (!periodMap.has(code)) {
      periodOrder.push(code);
      const start = formatHm(slot.startsAt);
      const end = formatHm(slot.endsAt);
      periodMap.set(code, {
        code,
        label: start && end ? `${start}-${end}` : start || code,
        startMinute: 0,
        endMinute: 0,
      });
    }
  });

  const countByKey = {};
  const selectedKeys = [];
  const highlightKeys = [];
  const keyBySlotId = {};

  allSlots.forEach((slot) => {
    const date = formatYmd(slot.slotDate);
    const code = String(slot.periodId || slot.periodCode || slot.id);
    const key = `${date}|${code}`;
    selectedKeys.push(key);
    keyBySlotId[slot.id] = key;
  });

  pairs.forEach(({ slotId, userId }) => {
    const key = keyBySlotId[slotId];
    if (!key) return;
    countByKey[key] = (countByKey[key] || 0) + 1;
    if (highlightUserId && userId === highlightUserId) {
      if (highlightKeys.indexOf(key) < 0) highlightKeys.push(key);
    }
  });

  // peopleByKey shows assignment count; if highlight mode, show 1 on mine
  const peopleByKey = { ...countByKey };
  if (highlightUserId) {
    highlightKeys.forEach((key) => {
      peopleByKey[key] = peopleByKey[key] || 1;
    });
  }

  return {
    periods: periodOrder.map((c) => periodMap.get(c)).filter(Boolean),
    dates,
    selectedKeys: highlightUserId && highlightKeys.length ? highlightKeys : selectedKeys,
    peopleByKey,
    // keep full selected for dual-layer if needed later
    allSelectedKeys: selectedKeys,
    highlightKeys,
  };
}

module.exports = {
  buildAssignmentRows,
  replaceAssignmentMember,
  buildPlanGrid,
};

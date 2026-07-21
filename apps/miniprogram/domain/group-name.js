function uniqueGroupName(rawName, existingNames) {
  const base = String(rawName || '').trim();
  if (!base) return '';
  const set = new Set((existingNames || []).map((n) => String(n)));
  if (!set.has(base)) return base;
  let k = 2;
  while (set.has(`${base}(${k})`)) k += 1;
  return `${base}(${k})`;
}

module.exports = { uniqueGroupName };

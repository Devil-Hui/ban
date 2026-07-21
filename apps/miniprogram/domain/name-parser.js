/**
 * Parse free-form reserved-name lists from step-5 rules input.
 * Separators: whitespace, comma/顿号/semicolon (half/full width), newlines.
 * Trims tokens, drops empties, and keeps first-occurrence uniqueness.
 */
function parseReservedNames(text) {
  return String(text || '')
    .split(/[\s,，、;；\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((name, i, arr) => arr.indexOf(name) === i);
}

module.exports = { parseReservedNames };

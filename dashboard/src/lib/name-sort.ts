function normalizeName(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

export function compareAlphabeticalNames(left: unknown, right: unknown) {
  return normalizeName(left).localeCompare(normalizeName(right), undefined, {
    sensitivity: "base",
    numeric: true,
  });
}
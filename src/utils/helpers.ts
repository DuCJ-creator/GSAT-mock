/**
 * Normalizes an `options` field that may come back from the AI as either:
 *   - a proper string array: ["(A) word1", "(B) word2", "(C) word3", "(D) word4"]
 *   - a single concatenated string: "(A) word1 (B) word2 (C) word3 (D) word4"
 *
 * Always returns a clean string array safe to call .find() / .map() on.
 */
export function normalizeOptions(options: any): string[] {
  if (Array.isArray(options)) return options;
  if (typeof options === "string") {
    const parts = options.split(/\s*(?=\([A-J]\))/).filter(Boolean);
    return parts.length > 0 ? parts : [options];
  }
  return [];
}

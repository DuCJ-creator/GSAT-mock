/**
 * Normalizes an `options` field that may come back from the AI in various formats:
 *   - Proper prefixed array: ["(A) word1", "(B) word2", "(C) word3", "(D) word4"]
 *   - Plain array without prefixes: ["word1", "word2", "word3", "word4"]
 *   - Single concatenated string: "(A) word1 (B) word2 (C) word3 (D) word4"
 *
 * Always returns a clean prefixed string array safe to call .find() / .map() on.
 */
export function normalizeOptions(options: any): string[] {
  if (!options) return [];

  if (Array.isArray(options)) {
    if (options.length === 0) return [];
    const first = String(options[0]).trim();
    // Already properly prefixed with (A), (B)... format
    if (/^\([A-J]\)/.test(first)) return options.map(String);
    // Items have "A) word" or "A. word" style prefix — normalize to "(A) word"
    if (/^[A-J][).]\s/.test(first)) {
      return options.map((opt: any) => {
        const s = String(opt).trim();
        return `(${s[0]}) ${s.substring(2).trim()}`;
      });
    }
    // Plain strings with no prefix — add (A), (B)... positionally
    const letters = ["A","B","C","D","E","F","G","H","I","J"];
    return options.map((opt: any, i: number) => `(${letters[i] || String(i+1)}) ${String(opt).trim()}`);
  }

  if (typeof options === "string") {
    const parts = options.split(/\s*(?=\([A-J]\))/).filter(Boolean);
    return parts.length > 1 ? parts : [options];
  }

  return [];
}

/**
 * Normalizes a correctAnswer field that may come back as "(A)" or "A".
 * Always returns a bare uppercase letter: "A", "B", "C", etc.
 */
export function normalizeAnswer(answer: any): string {
  if (typeof answer !== "string") return "";
  return answer.replace(/[()]/g, "").trim().toUpperCase();
}

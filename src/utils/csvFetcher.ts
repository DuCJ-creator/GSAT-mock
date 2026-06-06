/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VocabWord } from "../types";

/**
 * Minimal browser-safe CSV parser — no external dependencies.
 * Handles quoted fields containing commas.
 */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    rows.push(fields);
  }
  return rows;
}

export const fetchAndParseCSV = async (level: number): Promise<VocabWord[]> => {
  const url = `https://raw.githubusercontent.com/DuCJ-creator/iVocab-Self-Practice/main/level${level}.csv`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch CSV for level ${level}`);
    const csvText = await response.text();

    const rows = parseCSV(csvText);
    const data: VocabWord[] = [];

    // Skip header row (index 0)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 5) continue;

      const levelStr = row[0] || String(level);
      const unitStr  = row[1] || "1";
      const noStr    = row[2] || String(i);
      const wordStr  = row[3] || "";
      const posStr   = row[4] || "";
      const meaningStr = row.slice(5).join(",").trim();

      if (wordStr) {
        data.push({
          level: levelStr,
          unit: unitStr,
          no: noStr,
          word: wordStr,
          pos: posStr,
          meaning: meaningStr,
          id: `${levelStr}-${unitStr}-${noStr}`
        });
      }
    }

    return data;
  } catch (error) {
    console.error(`CSV Load Error for Level ${level}:`, error);
    return [];
  }
};

/**
 * Pads low self-input word lists with random system words from the selected CSV level.
 */
export const padVocabularyIfNecessary = async (
  selfInputWords: { word: string; pos?: string; meaning?: string }[],
  fallbackLevel: number,
  targetCount: number = 12
): Promise<{ word: string; pos?: string; meaning?: string }[]> => {
  const combined = [...selfInputWords];
  if (combined.length >= targetCount) return combined;

  const systemWords = await fetchAndParseCSV(fallbackLevel);
  if (systemWords.length === 0) return combined;

  const shuffled = [...systemWords].sort(() => 0.5 - Math.random());
  const existingSet = new Set(combined.map(w => w.word.toLowerCase()));

  for (const sw of shuffled) {
    if (combined.length >= targetCount) break;
    if (!existingSet.has(sw.word.toLowerCase())) {
      combined.push({ word: sw.word, pos: sw.pos, meaning: sw.meaning });
      existingSet.add(sw.word.toLowerCase());
    }
  }

  return combined;
};

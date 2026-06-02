/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Papa from "papaparse";
import { VocabWord } from "../types";

export const fetchAndParseCSV = async (level: number): Promise<VocabWord[]> => {
  const url = `https://raw.githubusercontent.com/DuCJ-creator/iVocab-Self-Practice/main/level${level}.csv`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch CSV for level ${level}`);
    }
    const csvText = await response.text();

    return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        header: false, // Parse raw rows manually to avoid header mismatch and ensure robust parsing
        skipEmptyLines: true,
        complete: (results) => {
          const data: VocabWord[] = [];
          
          // Row range starts from line index 1 (skipping line index 0 header row)
          for (let i = 1; i < results.data.length; i++) {
            const row = results.data[i] as string[];
            if (row && row.length >= 5) {
              const levelStr = row[0] ? row[0].trim() : String(level);
              const unitStr = row[1] ? row[1].trim() : "1";
              const noStr = row[2] ? row[2].trim() : String(i);
              const wordStr = row[3] ? row[3].trim() : "";
              const posStr = row[4] ? row[4].trim() : "";
              
              // Handle meanings that contain commas by joining remainder columns
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
          }
          resolve(data);
        },
        error: (err: any) => {
          reject(err);
        },
      });
    });
  } catch (error) {
    console.error(`CSV Load Error for Level ${level}:`, error);
    return [];
  }
};

/**
 * Pads low self-input word lists with random system words from the selected CSV level
 */
export const padVocabularyIfNecessary = async (
  selfInputWords: { word: string; pos?: string; meaning?: string }[],
  fallbackLevel: number,
  targetCount: number = 12
): Promise<{ word: string; pos?: string; meaning?: string }[]> => {
  const combined = [...selfInputWords];
  if (combined.length >= targetCount) {
    return combined;
  }

  const systemWords = await fetchAndParseCSV(fallbackLevel);
  if (systemWords.length === 0) {
    return combined;
  }

  // Shuffle system words
  const shuffled = [...systemWords].sort(() => 0.5 - Math.random());
  
  // Exclude existing word names (case insensitive)
  const existingSet = new Set(combined.map(w => w.word.toLowerCase()));

  for (const sw of shuffled) {
    if (combined.length >= targetCount) {
      break;
    }
    if (!existingSet.has(sw.word.toLowerCase())) {
      combined.push({
        word: sw.word,
        pos: sw.pos,
        meaning: sw.meaning
      });
      existingSet.add(sw.word.toLowerCase());
    }
  }

  return combined;
};

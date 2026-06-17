import express from "express";
import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json({ limit: "20mb" }));

const VOCAB_QUESTION_COUNT = 10;
const OPTIONS_PER_QUESTION = 4;
const UNIQUE_OPTION_WORDS_REQUIRED = VOCAB_QUESTION_COUNT * OPTIONS_PER_QUESTION;

let aiInstance: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not defined.");
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

let openaiInstance: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openaiInstance) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not defined.");
    openaiInstance = new OpenAI({ apiKey });
  }
  return openaiInstance;
}

function verifyApiKeys() {
  if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
    throw new Error("Please configure GEMINI_API_KEY or OPENAI_API_KEY.");
  }
}

async function callOpenAIHighQuality(system: string, user: string): Promise<any> {
  const openai = getOpenAI();
  const model = process.env.OPENAI_API_MODEL || "gpt-4o-mini";
  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user + "\nReturn ONLY valid JSON. No markdown." }
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });
  return JSON.parse((response.choices[0].message.content || "").trim());
}

async function validateUniquenessBatch(
  questions: any[]
): Promise<{
  results: {
    index: number;
    passed: boolean;
    reason?: string;
  }[];
}> {
  const items = questions.map((q: any, idx: number) => {
    const options = normalizeOptions(q.options);
    const correctAnswer = normalizeAnswer(q.correctAnswer);
    const correctIndex = ["A", "B", "C", "D"].indexOf(correctAnswer);
    const correctWord = correctIndex >= 0 ? optionWord(options[correctIndex] || "") : "";

    return {
      index: idx + 1,
      question: q.question,
      options,
      correctAnswerLetter: correctAnswer,
      correctAnswerWord: correctWord
    };
  });

  const result = await callOpenAI(
    `You are a strict GSAT English vocabulary item reviewer.
Your job is to detect whether any question has more than one defensible answer.`,
    `
Review the following vocabulary multiple-choice questions.

For each question, determine whether ONLY ONE answer is defensible.

A question FAILS if:
- another option could reasonably fit the sentence,
- the context is too weak to eliminate all distractors,
- two or more options could be defended by a competent English teacher.

A question PASSES only if:
- the correct answer is the only natural and logical choice,
- all distractors are clearly eliminated by contextual clues.

Questions:
${JSON.stringify(items, null, 2)}

Return ONLY this JSON shape:

{
  "results": [
    {
      "index": 1,
      "passed": true,
      "reason": ""
    }
  ]
}
`
  );

  return result;
}

async function callOpenAI(system: string, user: string): Promise<any> {
  const openai = getOpenAI();
  const model = process.env.OPENAI_API_MODEL || "gpt-4o-mini";
  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user + "\n\nCRITICAL: Return ONLY a valid JSON object. No markdown, no preamble." }
    ],
    response_format: { type: "json_object" },
    temperature: 0.45,
  });
  return JSON.parse((response.choices[0].message.content || "").trim());
}

async function callGemini(prompt: string, schema: any): Promise<any> {
  const ai = getGenAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: prompt,
    config: {
      systemInstruction: "You are Tr. Shirley Du, an elite GSAT English educator in Taiwan. Return ONLY valid JSON matching the schema exactly.",
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.45,
    },
  });
  if (!response.text) throw new Error("Empty response from Gemini.");
  return JSON.parse(response.text.trim());
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let j = copy.length - 1; j > 0; j--) {
    const k = Math.floor(Math.random() * (j + 1));
    [copy[j], copy[k]] = [copy[k], copy[j]];
  }
  return copy;
}

function makeAnswerKey(n: number, letters: string[]): string[] {
  const pool: string[] = [];
  const perLetter = Math.floor(n / letters.length);

  for (const l of letters) {
    for (let i = 0; i < perLetter; i++) pool.push(l);
  }

  let i = 0;
  while (pool.length < n) pool.push(letters[i++ % letters.length]);

  return shuffle(pool).slice(0, n);
}

function normalizeAnswer(answer: any): string {
  return String(answer || "").replace(/[()]/g, "").trim().toUpperCase();
}

function normalizeOptions(options: any): string[] {
  if (!options) return [];
  const letters = ["A", "B", "C", "D"];

  if (Array.isArray(options)) {
    return options.slice(0, 4).map((opt: any, idx: number) => {
      const raw = String(opt || "").trim();
      if (/^\([A-D]\)\s*/.test(raw)) return raw;
      if (/^[A-D][).]\s*/.test(raw)) return `(${raw[0]}) ${raw.substring(2).trim()}`;
      return `(${letters[idx]}) ${raw}`;
    });
  }

  if (typeof options === "string") {
    const parts = options.split(/\s*(?=\([A-D]\))/).filter(Boolean);
    return normalizeOptions(parts.length > 1 ? parts : [options]);
  }

  return [];
}

function optionWord(option: string): string {
  return option.replace(/^\([A-D]\)\s*/, "").trim();
}

function normalizePos(pos: any): string {
  const p = String(pos || "").toLowerCase().replace(/\./g, "").trim();
  if (["n", "noun", "名詞"].includes(p)) return "noun";
  if (["v", "verb", "vi", "vt", "動詞"].includes(p)) return "verb";
  if (["adj", "adjective", "形容詞"].includes(p)) return "adjective";
  if (["adv", "adverb", "副詞"].includes(p)) return "adverb";
  if (["prep", "preposition", "介系詞"].includes(p)) return "preposition";
  if (["conj", "conjunction", "連接詞"].includes(p)) return "conjunction";
  return p || "unspecified";
}

// ── NEW: strip POS tags and bracket annotations from a raw word string ──
function stripPosFromWord(raw: string): string {
  // Remove trailing POS tags like "vt", "vi", "n", "adj", "adv", "prep", "conj"
  // and bracket annotations like "[C]", "[U]", "[C,U]"
  return raw
    .replace(/\s+\S*\[.*?\]\S*/g, "")   // remove tokens containing brackets e.g. n[C,U]
    .replace(/\s+(vt|vi|v|n|noun|adj|adjective|adv|adverb|prep|preposition|conj|conjunction)\b.*/i, "")
    .trim();
}

// ── NEW: extract POS from a raw word line e.g. "increase  n[C,U]" → "n" ──
function extractPosFromLine(raw: string): string {
  const parts = raw.trim().split(/\s+/);
  if (parts.length < 2) return "";
  // POS is everything after the first token; strip bracket annotations
  return parts.slice(1).join(" ").replace(/\[.*?\]/g, "").trim();
}

function cleanVocabularyList(vocabList: any[]) {
  const clean = (Array.isArray(vocabList) ? vocabList : [])
    .map((vw: any) => {
      const rawWord = String(vw.word || "").trim();
      // If the word field contains embedded POS (e.g. "gossip vi"), split it out
      const word = stripPosFromWord(rawWord);
      const embeddedPos = rawWord !== word ? extractPosFromLine(rawWord) : "";
      const resolvedPos = vw.pos || embeddedPos;

      // Strip bracket annotations from meaning too e.g. "[U,C]" is not a meaning
      const rawMeaning = String(vw.meaning || "").trim();
      const meaning = /^\[.*?\]$/.test(rawMeaning) ? "" : rawMeaning;

      return {
        word,
        pos: normalizePos(resolvedPos),
        rawPos: String(resolvedPos || "").trim(),
        meaning,
        level: vw.level,
        unit: vw.unit
      };
    })
    .filter((vw: any) => vw.word.length > 0);

  const seen = new Set<string>();
  return clean.filter((vw: any) => {
    const key = vw.word.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseNumberValue(value: any): number | null {
  if (value === null || value === undefined) return null;
  const match = String(value).match(/\d+/);
  return match ? Number(match[0]) : null;
}

function getLevelNumber(v: any): number | null {
  return parseNumberValue(v?.level ?? v?.levelName ?? v?.selectedLevel);
}

function getUnitNumber(v: any): number | null {
  return parseNumberValue(v?.unit ?? v?.unitName ?? v?.selectedUnit);
}

function inferSelectedLevelUnit(selectedList: any[], explicitLevel?: any, explicitUnit?: any) {
  const explicitLevelNum = parseNumberValue(explicitLevel);
  const explicitUnitNum = parseNumberValue(explicitUnit);
  if (explicitLevelNum !== null || explicitUnitNum !== null) {
    return { level: explicitLevelNum, unit: explicitUnitNum };
  }

  const levelCounts = new Map<number, number>();
  const unitCounts = new Map<number, number>();

  for (const item of selectedList) {
    const level = getLevelNumber(item);
    const unit = getUnitNumber(item);
    if (level !== null) levelCounts.set(level, (levelCounts.get(level) || 0) + 1);
    if (unit !== null) unitCounts.set(unit, (unitCounts.get(unit) || 0) + 1);
  }

  const mostCommon = (map: Map<number, number>) => {
    let best: number | null = null;
    let bestCount = -1;
    for (const [num, count] of map.entries()) {
      if (count > bestCount || (count === bestCount && best !== null && num > best)) {
        best = num;
        bestCount = count;
      }
    }
    return best;
  };

  return { level: mostCommon(levelCounts), unit: mostCommon(unitCounts) };
}

function isWithinPreviousLevelUnitRange(v: any, selectedLevel: number | null, selectedUnit: number | null): boolean {
  const level = getLevelNumber(v);
  const unit = getUnitNumber(v);

  if (selectedLevel === null && selectedUnit === null) return true;

  if (selectedLevel !== null && level !== null) {
    if (level < selectedLevel) return true;
    if (level > selectedLevel) return false;
    if (selectedUnit !== null && unit !== null) return unit <= selectedUnit;
    return true;
  }

  if (selectedUnit !== null && unit !== null) {
    return unit <= selectedUnit;
  }

  return true;
}

function sortSupplementPoolByScope(vocabPool: any[], selectedLevel: number | null, selectedUnit: number | null) {
  return [...vocabPool].sort((a: any, b: any) => {
    const levelA = getLevelNumber(a) ?? -1;
    const levelB = getLevelNumber(b) ?? -1;
    const unitA = getUnitNumber(a) ?? -1;
    const unitB = getUnitNumber(b) ?? -1;

    if (selectedLevel !== null) {
      const levelDistanceA = Math.abs(selectedLevel - levelA);
      const levelDistanceB = Math.abs(selectedLevel - levelB);
      if (levelDistanceA !== levelDistanceB) return levelDistanceA - levelDistanceB;
    }

    if (selectedUnit !== null && levelA === levelB) {
      const unitDistanceA = Math.abs(selectedUnit - unitA);
      const unitDistanceB = Math.abs(selectedUnit - unitB);
      if (unitDistanceA !== unitDistanceB) return unitDistanceA - unitDistanceB;
    }

    if (levelA !== levelB) return levelB - levelA;
    return unitB - unitA;
  });
}

function mergeUniqueVocabularyLists(...lists: any[][]) {
  const seen = new Set<string>();
  const merged: any[] = [];

  for (const list of lists) {
    for (const item of cleanVocabularyList(list || [])) {
      const key = item.word.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }

  return merged;
}

function buildSupplementedVocabPool(
  selectedList: any[],
  fullBankList: any[],
  selectedLevel?: any,
  selectedUnit?: any
) {
  const selectedClean = cleanVocabularyList(selectedList || []);
  const fullClean = mergeUniqueVocabularyLists(fullBankList || [], selectedList || []);
  const scope = inferSelectedLevelUnit(selectedClean, selectedLevel, selectedUnit);

  const selectedKeys = new Set(selectedClean.map((v: any) => v.word.toLowerCase()));
  const scopedSupplement = fullClean.filter((v: any) =>
    !selectedKeys.has(v.word.toLowerCase()) &&
    isWithinPreviousLevelUnitRange(v, scope.level, scope.unit)
  );

  const broaderSupplement = fullClean.filter((v: any) =>
    !selectedKeys.has(v.word.toLowerCase()) &&
    !scopedSupplement.some((s: any) => s.word.toLowerCase() === v.word.toLowerCase())
  );

  return {
    selectedWords: selectedClean,
    vocabPool: mergeUniqueVocabularyLists(
      selectedClean,
      sortSupplementPoolByScope(scopedSupplement, scope.level, scope.unit),
      sortSupplementPoolByScope(broaderSupplement, scope.level, scope.unit)
    ),
    supplementScope: scope
  };
}

function pickTargetWords(selectedWords: any[], vocabPool: any[], count: number = VOCAB_QUESTION_COUNT) {
  const primary = shuffle(selectedWords);
  const primaryKeys = new Set(primary.map((v: any) => v.word.toLowerCase()));
  const supplement = shuffle(vocabPool.filter((v: any) => !primaryKeys.has(v.word.toLowerCase())));

  const picked = [...primary, ...supplement].slice(0, count);
  if (picked.length < count) {
    throw new Error(`Vocabulary question generation requires ${count} unique target words. Only ${picked.length} were available after supplementing from the word bank.`);
  }
  return picked;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function answerLeaksIntoQuestion(question: string, word: string): boolean {
  const q = String(question || "").toLowerCase();
  const w = String(word || "").toLowerCase().trim();
  if (!q || !w) return true;

  const exact = new RegExp(`\b${escapeRegExp(w)}\b`, "i");
  if (exact.test(q)) return true;

  const suffixes = ["s", "es", "ed", "ing", "er", "est", "ly", "ion", "ions", "ment", "ments", "ity", "ities", "al", "ally"];
  for (const suffix of suffixes) {
    const form = `${w}${suffix}`;
    const re = new RegExp(`\b${escapeRegExp(form)}\b`, "i");
    if (re.test(q)) return true;
  }

  return false;
}

function buildTargetWordList(targetWords: any[]): string {
  return targetWords.map((vw: any, i: number) =>
    `Q${i + 1}: ${vw.word} | POS=${vw.rawPos || vw.pos || "unspecified"} | meaning=${vw.meaning || "unspecified"}`
  ).join("\n");
}

function buildOptionsFromVocabPool(
  targetWord: any,
  vocabPool: any[],
  correctAnswer: string,
  usedOptionWords: Set<string>,
  targetWordKeys: Set<string>
): string[] {
  const letters = ["A", "B", "C", "D"];
  const correctIndex = letters.indexOf(correctAnswer);
  if (correctIndex < 0) throw new Error(`Invalid correct answer letter: ${correctAnswer}`);

  const target = String(targetWord.word || "").trim();
  const targetKey = target.toLowerCase();

  if (usedOptionWords.has(targetKey)) {
    throw new Error("OPTION_POOL_CONFLICT");
  }

  const isAvailableDistractor = (v: any) => {
    const key = String(v.word || "").toLowerCase();
    return (
      key &&
      key !== targetKey &&
      !targetWordKeys.has(key) &&
      !usedOptionWords.has(key)
    );
  };

  const samePos = vocabPool.filter((v: any) =>
    isAvailableDistractor(v) && v.pos === targetWord.pos
  );

  const fallback = vocabPool.filter((v: any) =>
    isAvailableDistractor(v) && v.pos !== targetWord.pos
  );

  const distractors = [
    ...shuffle(samePos),
    ...shuffle(fallback)
  ].slice(0, OPTIONS_PER_QUESTION - 1);

  if (distractors.length < OPTIONS_PER_QUESTION - 1) {
    throw new Error("INSUFFICIENT_UNIQUE_OPTION_POOL");
  }

  const optionWords = distractors.map((v: any) => v.word);
  optionWords.splice(correctIndex, 0, target);

  for (const word of optionWords) {
    usedOptionWords.add(String(word).toLowerCase());
  }

  return optionWords.map((word, idx) => `(${letters[idx]}) ${word}`);
}

// ── UPDATED: use AI-generated explanation from the stem call ──
function buildFallbackExplanation(targetWord: any, options: string[]): string {
  const correctWord = String(targetWord.word || "").trim();
  const distractors = options
    .map(optionWord)
    .filter((word) => word.toLowerCase() !== correctWord.toLowerCase());

  const distractorText = distractors.length > 0
    ? `其他選項 ${distractors.join("、")} 不符合本句語意或自然搭配，因此不是最佳答案。`
    : "其他選項不符合本句語意或自然搭配，因此不是最佳答案。";

  return `正解為 ${correctWord}。${distractorText}`;
}

function assembleVocabQuestions(
  data: any,
  targetWords: any[],
  vocabPool: any[],
  answerKey: string[]
) {
  const generated = Array.isArray(data?.vocabQuestions) ? data.vocabQuestions : [];
  const usedOptionWords = new Set<string>();
  const targetWordKeys = new Set(
    targetWords.map((v: any) => String(v.word || "").toLowerCase())
  );

  if (targetWordKeys.size < targetWords.length) {
    throw new Error("DUPLICATE_TARGET_WORDS");
  }

  if (vocabPool.length < UNIQUE_OPTION_WORDS_REQUIRED) {
    throw new Error(`Need at least ${UNIQUE_OPTION_WORDS_REQUIRED} unique vocabulary words to generate ${VOCAB_QUESTION_COUNT} questions with no repeated options. Only ${vocabPool.length} unique words are available after supplementing from the word bank.`);
  }

  return {
    vocabQuestions: targetWords.map((targetWord: any, idx: number) => {
      const raw = generated[idx] || {};
      const options = buildOptionsFromVocabPool(
        targetWord,
        vocabPool,
        answerKey[idx],
        usedOptionWords,
        targetWordKeys
      );

      // Use AI-generated explanation if present and non-empty; fall back to template
      const aiExplanation = String(raw.explanation || "").trim();
      const explanation = aiExplanation || buildFallbackExplanation(targetWord, options);

      return {
        id: `v${idx + 1}`,
        question: String(raw.question || "").trim(),
        options,
        correctAnswer: answerKey[idx],
        wordTested: targetWord.word,
        explanation
      };
    })
  };
}

function validateVocabQuestion(q: any, expected: any, expectedAnswer: string, index: number, vocabSet: Set<string>): string[] {
  const issues: string[] = [];
  const id = `Q${index + 1}`;

  if (!q || typeof q !== "object") {
    return [`${id}: question item is missing or invalid.`];
  }

  const question = String(q.question || "").trim();
  const expectedWord = String(expected.word || "").trim();
  const wordTested = String(q.wordTested || "").trim();
  const correctAnswer = normalizeAnswer(q.correctAnswer);
  const options = normalizeOptions(q.options);

  if (!/^v\d+$/.test(String(q.id || ""))) issues.push(`${id}: id must be v1 through v10.`);
  if (!question.includes("______")) issues.push(`${id}: question must contain exactly ______ as the blank.`);
  if ((question.match(/______/g) || []).length !== 1) issues.push(`${id}: question must contain exactly one blank.`);
  if (!wordTested) issues.push(`${id}: wordTested is missing.`);
  if (wordTested.toLowerCase() !== expectedWord.toLowerCase()) {
    issues.push(`${id}: wordTested must be exactly "${expectedWord}" from the CSV target list.`);
  }
  if (answerLeaksIntoQuestion(question, expectedWord)) {
    issues.push(`${id}: target word "${expectedWord}" appears in or leaks into the sentence.`);
  }
  if (options.length !== 4) issues.push(`${id}: options must contain exactly 4 choices.`);
  if (!["A", "B", "C", "D"].includes(correctAnswer)) issues.push(`${id}: correctAnswer must be A, B, C, or D.`);
  if (correctAnswer !== expectedAnswer) issues.push(`${id}: correctAnswer must be the pre-assigned letter ${expectedAnswer}.`);

  if (options.length === 4 && ["A", "B", "C", "D"].includes(correctAnswer)) {
    const correctIndex = ["A", "B", "C", "D"].indexOf(correctAnswer);
    const correctOptionWord = optionWord(options[correctIndex] || "");

    if (correctOptionWord.toLowerCase() !== expectedWord.toLowerCase()) {
      issues.push(`${id}: the option at (${expectedAnswer}) must exactly be "${expectedWord}".`);
    }

    const bareWords = options.map(optionWord).map(w => w.toLowerCase());
    if (new Set(bareWords).size !== 4) issues.push(`${id}: options must be four distinct words or phrases.`);
    if (bareWords.some(w => !w)) issues.push(`${id}: all options must be non-empty.`);

    for (const word of bareWords) {
      if (!vocabSet.has(word)) {
        issues.push(`${id}: option "${word}" is not from the uploaded vocabulary list.`);
      }
    }
  }

  if (!String(q.explanation || "").trim()) issues.push(`${id}: explanation is missing.`);

  return issues;
}

async function validateVocabSuite(
  data: any,
  targetWords: any[],
  answerKey: string[],
  vocabPool: any[]
): Promise<string[]> {
  const questions = data?.vocabQuestions;
  const issues: string[] = [];
  const vocabSet = new Set(vocabPool.map((v: any) => String(v.word || "").toLowerCase()));

  if (!Array.isArray(questions)) {
    return [`vocabQuestions must be an array.`];
  }

  if (questions.length !== targetWords.length) {
    issues.push(
      `vocabQuestions must contain exactly ${targetWords.length} items; received ${questions.length}.`
    );
  }

  const checkedQuestions = questions.slice(0, targetWords.length);
  const allOptionWords = checkedQuestions.flatMap((q: any) => normalizeOptions(q.options).map(optionWord).map((w: string) => w.toLowerCase()));
  if (new Set(allOptionWords).size !== allOptionWords.length) {
    issues.push("Options must not repeat anywhere within the 10-question vocabulary set.");
  }

  for (let i = 0; i < checkedQuestions.length; i++) {
    issues.push(
      ...validateVocabQuestion(
        checkedQuestions[i],
        targetWords[i],
        answerKey[i],
        i,
        vocabSet
      )
    );
  }

  if (process.env.ENABLE_AI_REVIEWER === "true") {
    const uniqueness = await validateUniquenessBatch(checkedQuestions);
    if (Array.isArray(uniqueness?.results)) {
      for (const result of uniqueness.results) {
        if (!result.passed) {
          console.warn(`Q${result.index}: Multiple defensible answers detected. ${result.reason || ""}`);
        }
      }
    }
  }

  return issues;
}

// ── UPDATED: now requests explanation from AI in the same call ──
function buildVocabPrompt(targetWords: any[], previousIssues: string[] = []) {
  const targetList = buildTargetWordList(targetWords);

  const correctionBlock = previousIssues.length > 0
    ? `Fix these validation issues:
${previousIssues.slice(0, 8).map((x, i) => `${i + 1}. ${x}`).join("\n")}
`
    : "";

  const system = `You write Taiwan GSAT-style English vocabulary question stems for high school students. Return compact JSON only.`;

  const user = `${correctionBlock}Generate exactly ${targetWords.length} vocabulary fill-in-the-blank questions.

For each target word:
1. Write one natural GSAT-level English sentence with exactly one blank: ______
   - The blank must grammatically require the target POS and semantically fit the meaning.
   - Do NOT include the target word or obvious inflected/derived forms in the sentence.
   - Provide enough context clues so the target word is the only natural completion.
2. Write one "explanation" in Traditional Chinese (繁體中文): one concise sentence explaining
   why this blank specifically calls for this word, referencing the sentence context.
   Do NOT reveal the answer word in the explanation.

Note: Options and answer letters are handled by the server — do NOT include them.

Targets:
${targetList}

Return JSON only:
{"vocabQuestions":[{"id":"v1","question":"... ______ ...","wordTested":"...","explanation":"（繁體中文說明）"}]}`;

  return { system, user };
}

function toUserFriendlyVocabError(error: any): string {
  const message = String(error?.message || "");

  if (
    message.includes("INSUFFICIENT_UNIQUE_OPTION_POOL") ||
    message.includes("OPTION_POOL_CONFLICT") ||
    message.includes("DUPLICATE_TARGET_WORDS") ||
    message.includes("Need at least") ||
    message.includes("Vocabulary question generation requires")
  ) {
    return "題目產生失敗：目前可用單字不足以產生 10 題且 10 題內選項不重複。請確認前端有傳入完整單字庫 allVocabList / fullVocabList / wordBank，或增加可用單字範圍後再試一次。";
  }

  if (message.includes("API_KEY")) {
    return message;
  }

  return "題目產生失敗，請稍後再試；若持續發生，請檢查單字庫資料格式是否完整。";
}

// ── Health ────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

// ── Vocab: GPT writes stems; server controls options 100% ────
app.post("/api/generate-vocab", async (req, res) => {
  try {
    const {
      vocabList,
      allVocabList,
      fullVocabList,
      wordBank,
      selectedLevel,
      selectedUnit
    } = req.body;
    verifyApiKeys();

    const fullBank = allVocabList || fullVocabList || wordBank || vocabList || [];
    const { selectedWords, vocabPool, supplementScope } = buildSupplementedVocabPool(
      vocabList || [],
      fullBank,
      selectedLevel,
      selectedUnit
    );

    if (vocabPool.length < UNIQUE_OPTION_WORDS_REQUIRED) {
      throw new Error(`Need at least ${UNIQUE_OPTION_WORDS_REQUIRED} unique vocabulary words to generate ${VOCAB_QUESTION_COUNT} questions with no repeated options. Please pass the full word bank as allVocabList/fullVocabList/wordBank.`);
    }

    const targetWords = pickTargetWords(selectedWords, vocabPool, VOCAB_QUESTION_COUNT);
    if (targetWords.length === 0) {
      throw new Error("No usable vocabulary words were provided.");
    }

    console.log("Vocab supplement scope:", supplementScope);

    const answerKey = makeAnswerKey(VOCAB_QUESTION_COUNT, ["A", "B", "C", "D"]);

    const stemOnlySchema = {
      type: Type.OBJECT,
      properties: {
        vocabQuestions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              question: { type: Type.STRING },
              wordTested: { type: Type.STRING },
              explanation: { type: Type.STRING }
            },
            required: ["id", "question", "wordTested", "explanation"]
          }
        }
      },
      required: ["vocabQuestions"]
    };

    let lastIssues: string[] = [];
    let rawData: any = null;
    let data: any = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      const { system, user } = buildVocabPrompt(targetWords, lastIssues);
      rawData = process.env.OPENAI_API_KEY
        ? await callOpenAIHighQuality(system, user)
        : await callGemini(user, stemOnlySchema);

      if (rawData?.vocabQuestions?.length > targetWords.length) {
        rawData.vocabQuestions = rawData.vocabQuestions.slice(0, targetWords.length);
      }

      data = assembleVocabQuestions(rawData, targetWords, vocabPool, answerKey);
      lastIssues = await validateVocabSuite(data, targetWords, answerKey, vocabPool);
      if (lastIssues.length === 0) break;
    }

    if (lastIssues.length > 0) {
      console.warn("Vocab validation warnings:", lastIssues);
    }

    if (data?.vocabQuestions?.length > 0) {
      data.vocabQuestions[0]._warning =
        "AI 出題提醒：題幹與解析由 AI 產生；選項與答案位置已由系統從指定字彙表與完整單字庫自動產生，10 題內選項不重複。正式使用前仍建議人工檢查。 / AI-generated stems and explanations; options and answer positions are generated programmatically from the selected vocabulary list and full word bank with no repeated options within the 10-question set.";
    }

    res.json({
      success: true,
      data
    });
  } catch (error: any) {
    console.error("Vocab error:", error);
    res.status(500).json({
      success: false,
      error: toUserFriendlyVocabError(error)
    });
  }
});

// Old endpoints intentionally disabled
app.post("/api/generate-cloze", async (_req, res) => {
  res.status(410).json({
    success: false,
    error: "Cloze generation has been disabled. This app now supports Vocabulary MCQ and Reading Comprehension only."
  });
});

app.post("/api/generate-matching", async (_req, res) => {
  res.status(410).json({
    success: false,
    error: "Blank matching generation has been disabled. This app now supports Vocabulary MCQ and Reading Comprehension only."
  });
});

// ── Reading ───────────────────────────────────────────────────
app.post("/api/generate-reading", async (req, res) => {
  try {
    const { vocabList, selectedReadingLevels } = req.body;
    verifyApiKeys();

    const levels = selectedReadingLevels?.length > 0 ? selectedReadingLevels : ["essential"];
    const cleanWords = (Array.isArray(vocabList) ? vocabList : [])
      .filter((vw: any) => vw?.word)
      .slice(0, 30)
      .map((vw: any) => `"${vw.word}" (POS: ${vw.pos || "unspecified"}; Meaning: ${vw.meaning || "unspecified"})`);

    const vocabString = cleanWords.length > 0
      ? cleanWords.join(", ")
      : "standard GSAT vocabulary";

    const passageKeys = levels.map(() => makeAnswerKey(4, ["A", "B", "C", "D"]));
    const keyDescriptions = levels.map((lvl: string, i: number) =>
      `${lvl} passage: Q1→${passageKeys[i][0]}, Q2→${passageKeys[i][1]}, Q3→${passageKeys[i][2]}, Q4→${passageKeys[i][3]}`
    ).join("; ");

    const system = `You are a senior GSAT English reading comprehension writer for Taiwan high school exams. Your passages and questions must be natural, precise, and unambiguous.`;

    const user = `Generate exactly ${levels.length} GSAT-style reading passage(s) for levels: ${levels.join(", ")}.

Use some reference vocabulary naturally when appropriate:
${vocabString}

Correct answer positions: ${keyDescriptions}

For each passage:
- 220-260 words, natural academic/magazine English.
- 4 questions: main idea, detail, vocab-in-context, inference/purpose.
- Options must be unambiguous and supported by the passage only.
- Put the correct answer at the assigned letter.
- Explanations in Traditional Chinese, one concise sentence each.

Return JSON only: {"readingPassages":[{"level":"...","title":"...","passage":"...","questions":[{"id":"...","question":"...","options":["(A) ...","(B) ...","(C) ...","(D) ..."],"correctAnswer":"A","explanation":"..."}]}]}`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        readingPassages: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              level: { type: Type.STRING },
              title: { type: Type.STRING },
              passage: { type: Type.STRING },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    question: { type: Type.STRING },
                    options: { type: Type.ARRAY, items: { type: Type.STRING } },
                    correctAnswer: { type: Type.STRING },
                    explanation: { type: Type.STRING }
                  },
                  required: ["id", "question", "options", "correctAnswer", "explanation"]
                }
              }
            },
            required: ["level", "title", "passage", "questions"]
          }
        }
      },
      required: ["readingPassages"]
    };

    const data = process.env.OPENAI_API_KEY ? await callOpenAI(system, user) : await callGemini(user, schema);

    if (Array.isArray(data?.readingPassages)) {
      data.readingPassages = data.readingPassages.map((p: any, pIdx: number) => ({
        ...p,
        questions: Array.isArray(p.questions)
          ? p.questions.slice(0, 4).map((q: any, qIdx: number) => ({
              ...q,
              id: q.id || `r${pIdx + 1}_${qIdx + 1}`,
              options: normalizeOptions(q.options),
              correctAnswer: normalizeAnswer(q.correctAnswer)
            }))
          : []
      }));
    }

    res.json({ success: true, data });
  } catch (error: any) {
    console.error("Reading error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── Evaluate report ───────────────────────────────────────────
app.post("/api/evaluate-report", async (req, res) => {
  try {
    const { scoreSummary, selectedLevel } = req.body;
    verifyApiKeys();

    const system = `You are Tr. Shirley Du, a warm, encouraging GSAT English educator in Taiwan. Write in Traditional Chinese.`;
    const user = `Write a personalized progress report as Tr. Shirley Du.
Performance:
- Overall: ${scoreSummary.comprehensive.correct}/${scoreSummary.comprehensive.total} (${scoreSummary.comprehensive.score}%)
- Vocabulary MCQ: ${scoreSummary.vocab.correct}/${scoreSummary.vocab.total}
- Reading Comprehension: ${scoreSummary.reading.correct}/${scoreSummary.reading.total}
- Level: ${selectedLevel || "Mixed"}

The feedback should be specific, warm, and practical. Mention vocabulary discrimination, collocation awareness, semantic-field distractors, and reading strategy when relevant.

Return JSON: { "greeting": string, "analysis": string, "tips": [string, string, string], "encouragement": string }`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        greeting: { type: Type.STRING },
        analysis: { type: Type.STRING },
        tips: { type: Type.ARRAY, items: { type: Type.STRING } },
        encouragement: { type: Type.STRING }
      },
      required: ["greeting", "analysis", "tips", "encouragement"]
    };

    const data = process.env.OPENAI_API_KEY ? await callOpenAI(system, user) : await callGemini(user, schema);
    res.json({ success: true, data });
  } catch (error: any) {
    console.error("Report error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default app;

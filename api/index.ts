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
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user + "\n\nCRITICAL: Return ONLY a valid JSON object. No markdown, no preamble." }
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

function cleanVocabularyList(vocabList: any[]) {
  const clean = (Array.isArray(vocabList) ? vocabList : [])
    .map((vw: any) => ({
      word: String(vw.word || "").trim(),
      pos: normalizePos(vw.pos),
      rawPos: String(vw.pos || "").trim(),
      meaning: String(vw.meaning || "").trim(),
      level: vw.level,
      unit: vw.unit
    }))
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
  return targetWords.map((vw: any, i: number) => {
    return `Q${i + 1}
- Target word: ${vw.word}
- POS from CSV: ${vw.rawPos || vw.pos || "unspecified"} (${vw.pos || "unspecified"})
- Chinese meaning from CSV: ${vw.meaning || "未提供"}`;
  }).join("\n\n");
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

  // A target word may appear only once: as its own correct answer.
  // Therefore, all 10 target words are pre-reserved and can never be used as distractors.
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

function buildProgrammaticExplanation(q: any, targetWord: any, options: string[]): string {
  const correctWord = String(targetWord.word || "").trim();
  const meaning = String(targetWord.meaning || "").trim() || "題目指定的中文意思";
  const distractors = options
    .map(optionWord)
    .filter((word) => word.toLowerCase() !== correctWord.toLowerCase());

  return `正解為 ${correctWord}，意思是「${meaning}」。本句的空格需要符合「${meaning}」這個語意，且與句中的上下文、搭配與邏輯關係最自然。${distrorsText(distractors)}雖然都是指定字彙表中的選項，但不符合本句所需的語意或自然搭配，因此不是最佳答案。`;
}

function distrorsText(distractors: string[]): string {
  if (distractors.length === 0) return "其他選項";
  return `其他選項 ${distractors.join("、")}`;
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
      return {
        id: `v${idx + 1}`,
        question: String(raw.question || "").trim(),
        options,
        correctAnswer: answerKey[idx],
        wordTested: targetWord.word,
        explanation: buildProgrammaticExplanation(raw, targetWord, options)
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

  const uniqueness = await validateUniquenessBatch(checkedQuestions);

  if (Array.isArray(uniqueness?.results)) {
    for (const result of uniqueness.results) {
      if (!result.passed) {
        console.warn(
          `Q${result.index}: Multiple defensible answers detected. ${result.reason || ""}`
        );
      }
    }
  } else {
    issues.push("Uniqueness validation failed: invalid reviewer response.");
  }

  return issues;
}

function buildVocabPrompt(targetWords: any[], previousIssues: string[] = []) {
  const targetList = buildTargetWordList(targetWords);

  const correctionBlock = previousIssues.length > 0
    ? `
PREVIOUS ATTEMPT FAILED SERVER VALIDATION.
You MUST fix every issue below:
${previousIssues.map((x, i) => `${i + 1}. ${x}`).join("\n")}
`
    : "";

  const system = `You are a senior GSAT English test writer with 20+ years of experience creating official Taiwanese GSAT-style vocabulary question stems. You are strict about part of speech, meaning, collocation, contextual clues, and natural English.`;

  const user = `${correctionBlock}

Generate EXACTLY ${targetWords.length} high-quality GSAT-style vocabulary question STEMS only.

IMPORTANT SYSTEM DESIGN:
You are responsible ONLY for writing the sentence stem.
The server will create all answer options and answer positions programmatically from the uploaded CSV vocabulary list.

DO NOT generate answer options.
DO NOT generate distractors.
DO NOT decide the correct answer letter.
DO NOT include A/B/C/D anywhere.

You MUST use the target words below exactly as the hidden correct answers.
Each question must test the assigned word from the CSV.
Do not skip any target word.
Do not repeat any target word.
Do not replace the target word with a synonym.

TARGET WORDS FROM CSV:
${targetList}

CORE PRINCIPLE:
The CSV provides the target word, its part of speech, and its Chinese meaning.
You MUST use all three:
1. Use the target word as the hidden correct answer.
2. Use the CSV POS to control the grammar of the blank.
3. Use the Chinese meaning to create a clear, natural context.

MANDATORY PROCESS FOR EACH QUESTION:

STEP 1 — Understand the target word.
For each assigned word:
- Read its English word.
- Read its POS from CSV.
- Read its Chinese meaning from CSV.
- Infer the correct usage and collocation.

Examples:
testimony / n. / 證詞 → legal communication
durability / n. / 耐久性 → product quality
visual / adj. / 視覺的 → perception / presentation mode
alleviate / v. / 減輕 → reduce a problem, pain, or burden

STEP 2 — Write a natural GSAT-level sentence.

The sentence must contain exactly one blank: ______

Requirements:
- The blank must require the CSV POS grammatically.
- The context must fit the Chinese meaning.
- The sentence must sound like authentic academic or formal English.
- The sentence must be realistic, natural, and factually reasonable.
- Avoid artificial phrases, childish examples, and strange situations.
- The target word must be the most natural completion.

CONTEXTUAL CLUE REQUIREMENT:
The sentence MUST contain strong contextual clues.
The clues should come from:
- collocation
- real-world knowledge
- cause-and-effect relationships
- purpose/result relationships
- specific situational details
- academic or professional contexts

Bad example:
The museum staff carefully ______ the floor.
Reason: context is too weak.

Good example:
The museum staff carefully ______ the hardwood floor with a protective coating to preserve its shine and prevent moisture damage.
Reason: the clue "protective coating" makes the intended meaning clear.

ANTI-LEAK RULE:
The target word MUST NOT appear anywhere in the question sentence.
Do not include direct morphological variants either.
If the target word appears in the sentence, the item fails.

QUALITY CHECK BEFORE RETURNING:
For every question, verify:
1. It tests the exact assigned CSV word.
2. The sentence contains exactly one blank.
3. The target word does not appear in the sentence.
4. The blank grammatically requires the CSV POS.
5. The sentence is natural and GSAT-appropriate.
6. The sentence provides clear semantic and collocational clues.

FORMAT:
- id: "v1" through "v${targetWords.length}"
- question: one complete sentence with exactly "______"
- wordTested: exact CSV target word

Return ONLY this JSON shape:
{
  "vocabQuestions": [
    {
      "id": "v1",
      "question": "... ______ ...",
      "wordTested": "..."
    }
  ]
}`;

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
              wordTested: { type: Type.STRING }
            },
            required: ["id", "question", "wordTested"]
          }
        }
      },
      required: ["vocabQuestions"]
    };

    let lastIssues: string[] = [];
    let rawData: any = null;
    let data: any = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
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
        "AI 出題提醒：題幹由 AI 產生；選項與答案位置已由系統從指定字彙表與完整單字庫自動產生，10 題內選項不重複。正式使用前仍建議人工檢查。 / AI-generated stems; options and answer positions are generated programmatically from the selected vocabulary list and full word bank with no repeated options within the 10-question set.";
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

// Old endpoints intentionally disabled because the current app supports only vocab + reading.
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
      .slice(0, 60)
      .map((vw: any) => `"${vw.word}" (POS: ${vw.pos || "unspecified"}; Meaning: ${vw.meaning || "unspecified"})`);

    const vocabString = cleanWords.length > 0
      ? cleanWords.join(", ")
      : "standard GSAT vocabulary";

    const passageKeys = levels.map(() => makeAnswerKey(4, ["A", "B", "C", "D"]));
    const keyDescriptions = levels.map((lvl: string, i: number) =>
      `${lvl} passage: Q1→${passageKeys[i][0]}, Q2→${passageKeys[i][1]}, Q3→${passageKeys[i][2]}, Q4→${passageKeys[i][3]}`
    ).join("; ");

    const system = `You are a senior GSAT English reading comprehension writer for Taiwan high school exams. Your passages and questions must be natural, precise, and unambiguous.`;

    const user = `Generate reading comprehension passages for levels: ${levels.join(", ")} using vocabulary references below:
${vocabString}

Pre-assigned correct answer positions: ${keyDescriptions}

MANDATORY PROCESS for each passage:

STEP 1: Choose a specific, genuinely interesting topic appropriate for the level.
Write 250-300 words that read like a real academic or magazine article.

STEP 2: Naturally incorporate some vocabulary from the reference list when appropriate.
Use the CSV meanings to avoid misusing words.

STEP 3: Write 4 comprehension questions:
- Q1: Main idea or best title
- Q2: Specific detail directly supported by the passage
- Q3: Vocabulary or phrase in context
- Q4: Inference, author's purpose, or implication

STEP 4: For each question, write 4 options and place the correct one at the pre-assigned letter.
- Each correct answer must be directly and unambiguously supported by the passage.
- Each distractor must be clearly wrong: contradicted, not mentioned, too broad, too narrow, or a plausible misreading.
- Avoid choices that are correct due to outside general knowledge.

QUALITY STANDARDS:
- Natural academic English.
- Factually reasonable content.
- No ambiguous questions.
- No two options can both be defensible.
- Traditional Chinese explanations must cite the relevant idea from the passage.

FORMAT:
level, title, passage, questions.
Each question must include id, question, options, correctAnswer, explanation.

Return EXACTLY ${levels.length} passage(s).

Return JSON: { "readingPassages": [...exactly ${levels.length} passage(s)...] }`;

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

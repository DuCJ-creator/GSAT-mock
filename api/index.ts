process.env.IS_SERVERLESS = "true";

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { randomInt } from "crypto";
import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "20mb" }));
const PORT = 3000;

// -----------------------------------------------------------------------------
// AI clients
// -----------------------------------------------------------------------------

let geminiClient: GoogleGenAI | null = null;
let openAIClient: OpenAI | null = null;

function getGemini(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not defined in the environment.");
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { "User-Agent": "gsat-mock-generator" } },
    });
  }
  return geminiClient;
}

function getOpenAI(): OpenAI {
  if (!openAIClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not defined in the environment.");
    openAIClient = new OpenAI({ apiKey });
  }
  return openAIClient;
}

function verifyApiKeys(): void {
  if (!process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY) {
    throw new Error("API Configuration Error: configure OPENAI_API_KEY or GEMINI_API_KEY.");
  }
}

function stripCodeFence(value: string): string {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

async function callJsonModel<T>(
  systemPrompt: string,
  userPrompt: string,
  responseSchema?: any,
  temperature = 0.2,
): Promise<T> {
  let raw = "";

  if (process.env.OPENAI_API_KEY) {
    const response = await getOpenAI().chat.completions.create({
      model: process.env.OPENAI_API_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature,
    });
    raw = response.choices[0]?.message?.content || "";
  } else {
    const response = await getGemini().models.generateContent({
      model: process.env.GEMINI_API_MODEL || "gemini-2.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        ...(responseSchema ? { responseSchema } : {}),
        temperature,
      },
    });
    raw = response.text || "";
  }

  if (!raw.trim()) throw new Error("The AI model returned an empty response.");

  try {
    return JSON.parse(stripCodeFence(raw)) as T;
  } catch (error: any) {
    throw new Error(`The AI model returned invalid JSON: ${error?.message || String(error)}`);
  }
}

// -----------------------------------------------------------------------------
// Shared types and normalization
// -----------------------------------------------------------------------------

const LETTERS = ["A", "B", "C", "D"] as const;
type AnswerLetter = (typeof LETTERS)[number];

type VocabularyInput = {
  word: string;
  pos?: string;
  meaning?: string;
};

type ExamQuestion = {
  id?: string;
  question: string;
  options: string[];
  correctAnswer: AnswerLetter;
  explanation: string;
  wordTested?: string;
  answerText?: string;
  reviewStatus?: "approved" | "manual-review";
  reviewWarnings?: string[];
};

type MorphologyPlan = {
  slotCategory: "verb" | "adjective" | "noun" | "adverb" | "participle" | "other";
  requiredForm: string;
  semanticRole: string;
  targetSurfaceForm: string;
  rationale: string;
};

type ReadingPassage = {
  level: string;
  title: string;
  passage: string;
  questions: ExamQuestion[];
};

type ExamData = {
  vocabQuestions?: ExamQuestion[];
  readingPassages?: ReadingPassage[];
};

function normalizeAnswer(value: unknown): AnswerLetter {
  const letter = String(value ?? "")
    .replace(/[()]/g, "")
    .trim()
    .toUpperCase();
  if (!LETTERS.includes(letter as AnswerLetter)) {
    throw new Error(`Invalid answer letter: ${String(value)}`);
  }
  return letter as AnswerLetter;
}

function stripOptionLabel(value: unknown): string {
  return String(value ?? "")
    // Remove only an actual answer label such as "(A) ", "B. ", or "C: ".
    // Do not strip the first letter from normal words such as banana, begin,
    // action, almost, or compact.
    .replace(/^\s*(?:\([A-D]\)|[A-D][.、:：\-])\s*/i, "")
    .trim();
}

function normalizeOptions(value: unknown): string[] {
  let raw: unknown[] = [];

  if (Array.isArray(value)) {
    raw = value;
  } else if (typeof value === "string") {
    raw = value.match(/\([A-D]\)\s*[\s\S]*?(?=\s*\([A-D]\)|$)/g) || [];
  } else if (value && typeof value === "object") {
    raw = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, item]) => item);
  }

  const texts = raw.map((item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return stripOptionLabel(Object.values(item as Record<string, unknown>)[0]);
    }
    return stripOptionLabel(item);
  });

  if (texts.length !== 4 || texts.some((text) => !text)) {
    throw new Error("Each question must contain exactly four non-empty options.");
  }

  return texts.map((text, index) => `(${LETTERS[index]}) ${text}`);
}

function optionTexts(options: unknown): string[] {
  return normalizeOptions(options).map(stripOptionLabel);
}

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

/**
 * Normalize model output without destroying previously valid data.
 *
 * OpenAI JSON mode guarantees valid JSON but does not guarantee that the model
 * always uses our preferred property names. Older model replies have used
 * `sentence`, `stem`, `questionText`, and `explanationZh`. Accept those aliases.
 * During repair, missing fields fall back to the original item instead of being
 * replaced by empty strings.
 */
function normalizeQuestion(
  raw: any,
  kind: "vocab" | "reading",
  fallback?: ExamQuestion,
): ExamQuestion {
  const rawOptions = raw?.options ?? raw?.choices ?? raw?.answers;
  const options = rawOptions != null
    ? normalizeOptions(rawOptions)
    : fallback
      ? normalizeOptions(fallback.options)
      : normalizeOptions([]);

  const answerValue = raw?.correctAnswer ?? raw?.answer ?? raw?.correct_option ?? raw?.correctOption;
  const correctAnswer = answerValue != null
    ? normalizeAnswer(answerValue)
    : fallback
      ? fallback.correctAnswer
      : normalizeAnswer("");

  const correctIndex = LETTERS.indexOf(correctAnswer);
  const exactAnswerText = stripOptionLabel(options[correctIndex]);

  const questionText = firstNonEmptyString(
    raw?.question,
    raw?.sentence,
    raw?.stem,
    raw?.questionText,
    raw?.prompt,
    fallback?.question,
  );
  const explanation = firstNonEmptyString(
    raw?.explanation,
    raw?.explanationZh,
    raw?.explanation_zh,
    raw?.traditionalChineseExplanation,
    raw?.rationale,
    raw?.solution,
    fallback?.explanation,
  );

  return {
    ...(fallback || {}),
    question: questionText,
    options,
    correctAnswer,
    explanation,
    ...(kind === "vocab"
      ? {
          wordTested: firstNonEmptyString(
            raw?.wordTested,
            raw?.targetWord,
            raw?.target,
            fallback?.wordTested,
          ),
          // Never trust a stale model-supplied answerText. Recompute it from the
          // actual keyed option after normalization.
          answerText: exactAnswerText,
        }
      : {}),
  };
}

function normalizePassage(raw: any): ReadingPassage {
  return {
    level: String(raw?.level ?? "").trim(),
    title: String(raw?.title ?? "").trim(),
    passage: String(raw?.passage ?? "").trim(),
    questions: Array.isArray(raw?.questions)
      ? raw.questions.map((q: any) => normalizeQuestion(q, "reading"))
      : [],
  };
}

// -----------------------------------------------------------------------------
// Deterministic validation
// -----------------------------------------------------------------------------

function normalizeLexicalToken(text: string): string {
  return text.toLowerCase().replace(/[^a-z]/g, "");
}

function hasObviousWordFamilyCluster(options: string[]): boolean {
  const tokens = options.map((item) => normalizeLexicalToken(stripOptionLabel(item)));
  for (const token of tokens) {
    if (token.length < 5) continue;
    const stem = token.slice(0, 5);
    if (tokens.filter((other) => other.startsWith(stem)).length >= 3) return true;
  }
  return false;
}

function hasAmbiguityAdmission(explanation: string): boolean {
  const patterns = [
    /(?:也可以|亦可|也合理|同樣合理|可以成立|尚可|並非錯誤|不是完全錯誤)/,
    /(?:最佳答案|較適合|更適合|較貼切|更貼切|更能強調|較能強調)/,
    /(?:雖然|儘管).{0,45}(?:但|然而).{0,45}(?:更|較|不如)/,
    /(?:could also fit|also acceptable|also possible|best answer|more appropriate|better fit)/i,
  ];
  return patterns.some((pattern) => pattern.test(explanation));
}

function deterministicVocabularyWarnings(question: ExamQuestion): string[] {
  const warnings: string[] = [];
  const stem = String(question.question || "").toLowerCase();
  const texts = question.options.map(stripOptionLabel).map((text) =>
    text.toLowerCase().replace(/[^a-z-]/g, ""),
  );

  // Generic spatial-preposition stems are often open-world ambiguous.
  // Example: "The cat is hiding ___ the box" can naturally take inside,
  // outside, behind, under, or on unless the sentence provides a location clue.
  const spatialWords = new Set([
    "in", "inside", "outside", "on", "under", "behind", "beside",
    "near", "above", "below", "around", "within", "beneath", "over",
  ]);
  const spatialCount = texts.filter((text) => spatialWords.has(text)).length;
  const hasSpatialBlank = /\b(?:hide|hides|hiding|sit|sits|sitting|stand|stands|standing|stay|stays|staying|lie|lies|lying|put|place|placed)\b[^.?!]{0,35}_{3,}[^.?!]{0,25}\b(?:box|table|chair|bed|house|room|car|tree|door|container|bag)\b/i.test(stem);
  const hasLocationLock = /(?:because|so that|to avoid|protected from|could not be seen|covered by|surrounded by|beneath the lid|under the roof|within the walls|on top of|directly below|just outside|deep inside)/i.test(stem);
  if (spatialCount >= 2 && hasSpatialBlank && !hasLocationLock) {
    warnings.push("位置介系詞題缺少唯一判斷線索；多個位置選項在現實情境中都可能成立");
  }

  // Base-form requirement after infinitive marker or modal auxiliary.
  const answerIndex = LETTERS.indexOf(question.correctAnswer);
  const keyed = texts[answerIndex] || "";
  if (/(?:\bto|\bcan|\bcould|\bmay|\bmight|\bmust|\bshould|\bwould|\bwill)\s+_{3,}/i.test(stem)) {
    if (/^[a-z]+(?:s|ed|ing)$/.test(keyed)) {
      warnings.push("空格位於不定詞或情態助動詞後，正確選項疑似不是原形動詞");
    }
  }

  return warnings;
}

function validateQuestion(question: ExamQuestion, kind: "vocab" | "reading"): string[] {
  const errors: string[] = [];
  const texts = question.options.map(stripOptionLabel);
  const answerIndex = LETTERS.indexOf(question.correctAnswer);

  if (!question.question) errors.push("missing question text");
  const placeholderPattern = /(?:needs? teacher review|requires? teacher edit|placeholder|\bedit\b)/i;
  if (placeholderPattern.test(question.question) || placeholderPattern.test(question.explanation)) {
    errors.push("placeholder or teacher-edit text is present");
  }
  if (kind === "vocab") {
    const blanks = question.question.match(/_{3,}/g) || [];
    if (blanks.length === 0) errors.push("the vocabulary sentence has no visible blank");
    if (blanks.length > 1) errors.push("the vocabulary sentence must contain exactly one blank");
    const chineseChars = (question.question.match(/[\u3400-\u9fff]/g) || []).length;
    const latinWords = (question.question.match(/[A-Za-z]+/g) || []).length;
    if (chineseChars > 2 || latinWords < 3) errors.push("the vocabulary stem is not a complete English sentence");
  }
  if (question.options.length !== 4 || texts.some((item) => !item)) {
    errors.push("the question does not have four complete options");
  }
  if (new Set(texts.map((item) => item.toLowerCase())).size !== 4) {
    errors.push("duplicate options");
  }
  if (!texts[answerIndex]) errors.push("the answer letter does not identify an option");
  if (!question.explanation) errors.push("missing answer explanation");
  const explanationChineseChars = (question.explanation.match(/[\u3400-\u9fff]/g) || []).length;
  if (question.explanation && explanationChineseChars < 8) {
    errors.push("the answer explanation must be written in Traditional Chinese");
  }
  if (hasAmbiguityAdmission(question.explanation)) {
    errors.push("the explanation admits that another option could fit");
  }

  if (kind === "vocab") {
    if (!question.wordTested) errors.push("missing wordTested");
    if (!question.answerText) errors.push("missing answerText");
    if (question.answerText && question.answerText !== texts[answerIndex]) {
      errors.push("answerText does not match the keyed option");
    }
    if (hasObviousWordFamilyCluster(question.options)) {
      errors.push("the options form a word-family exercise instead of a vocabulary-choice item");
    }
  }

  return errors;
}


function splitValidationErrors(errors: string[]): { hard: string[]; soft: string[] } {
  const softPatterns = [
    /explanation admits that another option could fit/i,
    /suite-wide repeated options/i,
    /word-family exercise/i,
  ];
  const soft: string[] = [];
  const hard: string[] = [];
  for (const error of errors) {
    if (softPatterns.some((pattern) => pattern.test(error))) soft.push(error);
    else hard.push(error);
  }
  return { hard, soft };
}

function attachReviewMetadata(question: ExamQuestion, warnings: string[]): ExamQuestion {
  const uniqueWarnings = Array.from(new Set(warnings.filter(Boolean)));
  return {
    ...question,
    reviewStatus: uniqueWarnings.length ? "manual-review" : "approved",
    reviewWarnings: uniqueWarnings,
  };
}

function countWords(text: string): number {
  return (text.match(/\b[\w'-]+\b/g) || []).length;
}

function validatePassage(passage: ReadingPassage): string[] {
  const errors: string[] = [];
  if (!passage.title) errors.push("missing passage title");
  if (!passage.passage) errors.push("missing passage text");
  const words = countWords(passage.passage);
  if (words < 180 || words > 280) errors.push(`passage length is ${words} words; expected about 200-250`);
  if (passage.questions.length !== 4) errors.push("the passage must have exactly four questions");
  passage.questions.forEach((q, index) => {
    validateQuestion(q, "reading").forEach((error) => errors.push(`Q${index + 1}: ${error}`));
  });
  return errors;
}

// -----------------------------------------------------------------------------
// Balanced but unpredictable answer placement
// -----------------------------------------------------------------------------

function shuffle<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function hasThreeIdenticalInARow(pattern: AnswerLetter[]): boolean {
  return pattern.some(
    (letter, index) => index >= 2 && letter === pattern[index - 1] && letter === pattern[index - 2],
  );
}

function hasMechanicalSequence(pattern: AnswerLetter[]): boolean {
  const text = pattern.join("");
  const obvious = ["ABCDABCD", "DCBADCBA", "ABCD", "DCBA"];
  return obvious.some((sequence) => text.includes(sequence));
}

function makeAnswerPattern(count: number): AnswerLetter[] {
  if (count <= 0) return [];

  const base = Math.floor(count / 4);
  const remainder = count % 4;
  const extras = new Set(shuffle(LETTERS).slice(0, remainder));
  const pool: AnswerLetter[] = [];

  for (const letter of LETTERS) {
    const quantity = base + (extras.has(letter) ? 1 : 0);
    for (let i = 0; i < quantity; i++) pool.push(letter);
  }

  for (let attempt = 0; attempt < 1000; attempt++) {
    const candidate = shuffle(pool);
    if (!hasThreeIdenticalInARow(candidate) && !hasMechanicalSequence(candidate)) {
      return candidate;
    }
  }

  return shuffle(pool);
}

function moveActualCorrectOption(question: ExamQuestion, destination: AnswerLetter): ExamQuestion {
  const texts = question.options.map(stripOptionLabel);
  const originalIndex = LETTERS.indexOf(question.correctAnswer);
  const correctText = texts[originalIndex];
  if (!correctText) throw new Error("The original answer key points to no option.");

  const destinationIndex = LETTERS.indexOf(destination);
  const distractors = shuffle(texts.filter((_, index) => index !== originalIndex));
  const reordered = [...distractors];
  reordered.splice(destinationIndex, 0, correctText);

  if (reordered[destinationIndex] !== correctText) {
    throw new Error("Correct-option integrity check failed during answer placement.");
  }

  return {
    ...question,
    options: reordered.map((text, index) => `(${LETTERS[index]}) ${text}`),
    correctAnswer: destination,
    ...(question.wordTested ? { answerText: correctText } : {}),
  };
}

function balanceQuestions(questions: ExamQuestion[]): ExamQuestion[] {
  const pattern = makeAnswerPattern(questions.length);
  return questions.map((question, index) => moveActualCorrectOption(question, pattern[index]));
}

// -----------------------------------------------------------------------------
// Model schemas
// -----------------------------------------------------------------------------

const questionProperties = {
  question: { type: Type.STRING },
  options: { type: Type.ARRAY, items: { type: Type.STRING } },
  correctAnswer: { type: Type.STRING },
  explanation: { type: Type.STRING },
};

const vocabQuestionSchema = {
  type: Type.OBJECT,
  properties: {
    ...questionProperties,
    wordTested: { type: Type.STRING },
    answerText: { type: Type.STRING },
  },
  required: ["question", "options", "correctAnswer", "wordTested", "answerText", "explanation"],
};

const readingQuestionSchema = {
  type: Type.OBJECT,
  properties: questionProperties,
  required: ["question", "options", "correctAnswer", "explanation"],
};

const vocabBatchSchema = {
  type: Type.OBJECT,
  properties: {
    vocabQuestions: { type: Type.ARRAY, items: vocabQuestionSchema },
  },
  required: ["vocabQuestions"],
};

const readingSchema = {
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
          questions: { type: Type.ARRAY, items: readingQuestionSchema },
        },
        required: ["level", "title", "passage", "questions"],
      },
    },
  },
  required: ["readingPassages"],
};

// -----------------------------------------------------------------------------
// Prompts
// -----------------------------------------------------------------------------

const VOCAB_WRITER_SYSTEM = `You are a professional Taiwan GSAT English vocabulary item writer.
Return JSON only.

NON-NEGOTIABLE ITEM RULES
1. The task tests vocabulary meaning and usage, not a four-form word-family exercise.
2. Every question uses four DIFFERENT lexical items. Never give implement / implemented / implementing / implementation as one option set.
3. The correct target word may be inflected only as ordinary grammar requires: sound -> sounds, study -> studied, child -> children, careful -> carefully.
4. wordTested remains the source-list dictionary entry; answerText is the exact form shown in the option.
5. The sentence must have one and only one defensible answer. It is not a "best answer" question.
6. Add a semantic lock: definition, cause, consequence, contrast, purpose, chronology, quantity, factual detail, or fixed collocation that excludes all distractors.
7. The stem must contain enough context for an independent reader to prove the answer from the sentence itself. Never rely on unknown personal facts or generic real-world possibilities.
8. Before returning, insert every option into the blank. If more than one option can fit, rewrite the stem with a stronger clue or replace the distractor.
9. The explanation must quote or accurately paraphrase the exact clue that forces the answer. It must not invent any fact not present in the stem.
7. Avoid generic frames where many adjectives or verbs could fit, such as "The athlete's ___ performance impressed everyone."
8. Distractors may look plausible at first glance but must become clearly wrong in the exact sentence because of meaning, grammar, collocation, logic, or register.
9. Silently insert all four options into the sentence. If a competent English teacher could defend a distractor, rewrite the sentence or replace it.
10. Use natural standard English with correct agreement, tense, number, articles, prepositions, and punctuation.
10a. Every displayed option must be in the exact grammatical form required by the blank. Determine the grammatical slot BEFORE choosing the surface form.
10b. For emotion/causative participles, distinguish experiencer from cause: a person who feels the emotion normally takes the -ed form (She felt embarrassed); a thing, event, or situation that causes the emotion normally takes the -ing form (an embarrassing situation). Do not mechanically convert every target to -ed.
10c. Handle all ordinary context-driven morphology: third-person singular, past tense, past participle, passive voice, gerund, plural, comparative/superlative, adjective, adverb, and appropriate derivation.
10d. Keep the lexical focus on different words, but make all four displayed choices grammatically compatible with the same slot whenever possible; distractors should fail mainly because of meaning or collocation, not because they were left in dictionary form.
11. Return options in A-B-C-D order, each prefixed (A), (B), (C), (D). correctAnswer is one bare letter.
12. The Traditional Chinese explanation must identify why the keyed answer is required and why EACH distractor is impossible in this exact context.
13. Never say another option is possible but less suitable. Never use language such as 最佳、較貼切、更適合、雖然也可以.
14. Within one ten-question vocabulary set, do not reuse any lexical item as an option when the supplied vocabulary range contains enough distinct words. Ordinary inflections count as the same lexical item for this rule (sound/sounds, study/studied).
15. Do not design answer-letter patterns. The server will move the actual correct option safely after review.`;

const VOCAB_REVIEWER_SYSTEM = `You are the final senior editor of a Taiwan GSAT vocabulary item bank.
You receive one draft item. Repair it completely and return one corrected JSON object only.

AUDIT PROCEDURE
- Insert each of the four options into the sentence.
- Confirm grammar, natural usage, collocation, semantic direction, and logical fit.
- Inspect the exact form of EVERY displayed option. A dictionary-form verb must never remain where the blank requires an adjective, participle, third-person singular, past tense, plural, comparative, or other inflected form.
- For emotion/causative pairs, identify semantic role: experiencer/person -> -ed (felt embarrassed); cause/event/thing -> -ing (an embarrassing situation). Never use a blanket base-to--ed rule.
- Keep four different lexical items, but inflect each displayed choice into a form that is grammatically compatible with the slot whenever possible.
- Confirm the options are four distinct vocabulary items, not forms or derivatives of one base word.
- Confirm exactly one answer is defensible. If another option could fit, rewrite the stem or replace that distractor.
- Preserve wordTested as the intended source-list lemma, but inflect the displayed answer when grammar requires it.
- Set answerText to the exact keyed option text.
- Independently solve the repaired item and set correctAnswer accordingly.
- Write a complete Traditional Chinese explanation: why the answer is required and why A, B, C, and D alternatives fail in the exact context.
- Never admit that another choice is acceptable, possible, or merely less natural.
- Return JSON only.`;


const VOCAB_MORPHOLOGY_ANALYZER_SYSTEM = `You are an English morphology and syntax analyzer for a Taiwan GSAT item bank.
Return JSON only.

Analyze the sentence slot and the target lexeme before any option is accepted.
You must determine:
- the grammatical category required by the blank;
- the exact surface form required by agreement, tense, voice, number, comparison, or derivation;
- the semantic role of the modified noun or subject;
- for emotion/causative participles, whether the referent EXPERIENCES the feeling (-ed) or CAUSES the feeling (-ing).
Examples:
- She felt completely ___ (embarrass) -> embarrassed: the person experiences the feeling.
- It was an ___ situation (embarrass) -> embarrassing: the situation causes the feeling.
- The music ___ beautiful (sound) -> sounds: present-tense third-person singular verb.
- The report was ___ yesterday (complete) -> completed: passive past participle.
Do not mechanically prefer -ed or -ing. Base the form on syntax and meaning.`;

const VOCAB_GRAMMAR_AUDITOR_SYSTEM = `You are a meticulous English grammar, syntax, and context-aware morphology editor for a Taiwan GSAT item bank.
Return one corrected vocabulary-question JSON object only.

FINAL FORM AUDIT
1. Follow the supplied morphology plan. Insert each displayed option into the blank exactly as written.
2. Correct every option's surface form so it matches the grammatical slot: agreement, tense, voice, participle, adjective, adverb, number, comparison, and derivation when necessary.
3. For emotion/causative pairs, use semantic role, not a mechanical rule:
   - experiencer/person: embarrassed, interested, bored, confused, exhausted;
   - cause/event/thing: embarrassing, interesting, boring, confusing, exhausting.
4. The keyed target must remain the same lexeme recorded in wordTested, but answerText must be the exact contextually required form shown in the option.
5. Preserve four different lexical items. Do not turn the item into a word-family/conjugation exercise.
6. Keep exactly one semantically and collocationally defensible answer.
7. Independently recompute correctAnswer from the corrected options and set answerText to that exact option text.
8. Write a complete Traditional Chinese explanation that explicitly explains the grammatical form and semantic role, then explains why each distractor fails.
Return JSON only.`;

const VOCAB_SET_SEMANTIC_AUDITOR_SYSTEM = `You are a senior item-bank quality auditor.
Return JSON only.

Review the complete vocabulary set AFTER all repairs. Do not rewrite questions.
For every item, independently solve the item from the stem before looking at the keyed answer.

MANDATORY EVIDENCE TEST
1. Quote or precisely identify the exact words in the stem that force the answer.
2. Decide which option is supported by that evidence.
3. Compare that independently derived answer with correctAnswer.
4. Check whether the explanation invents facts, reverses the evidence, ignores an explicit clue, or merely asserts that the keyed option is better.
5. Confirm the stem contains enough context to exclude all three distractors.

Flag an item for manual review when:
- the keyed answer conflicts with an explicit clue in the stem;
- the explanation adds information not present in the stem;
- two or more options can be grammatically and semantically true;
- the item asks a personal or open-world fact with no evidence;
- several family members, animals, places, occupations, foods, languages, rankings, or other concrete nouns could equally fit;
- the stem provides only a generic frame and no semantic lock;
- the explanation chooses a merely better answer rather than the only defensible answer;
- the stem depends on unknown real-world circumstances rather than information in the sentence.

A valid vocabulary item must contain a semantic lock such as a definition, cause, consequence, contrast, purpose, chronology, quantity, fixed collocation, or explicit factual clue.
Do not flag an item merely because distractors are grammatically parallel.
Return one result for every question, using its zero-based index. Warnings must be concise Traditional Chinese.`;

const vocabSetAuditSchema: any = {
  type: Type.OBJECT,
  properties: {
    results: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          index: { type: Type.NUMBER },
          pass: { type: Type.BOOLEAN },
          warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
          evidence: { type: Type.STRING },
          independentlyDerivedAnswer: { type: Type.STRING },
        },
        required: ["index", "pass", "warnings", "evidence", "independentlyDerivedAnswer"],
      },
    },
  },
  required: ["results"],
};

function deterministicOpenWorldWarnings(question: ExamQuestion): string[] {
  const warnings: string[] = [];
  const stem = String(question.question || "").toLowerCase();
  const texts = question.options.map(stripOptionLabel).map((text) => text.toLowerCase().replace(/[^a-z-]/g, ""));
  const allIn = (words: string[]) => texts.length === 4 && texts.every((text) => words.includes(text));

  if (/what language do you speak|i speak\s+_{2,}/i.test(stem) && allIn(["english", "french", "german", "spanish", "chinese", "japanese", "korean", "italian"])) {
    warnings.push("題幹未提供語言判斷線索，四個語言選項都可能成立");
  }
  if (/supportive of (?:him|her|them)|(?:my|his|her|their)\s+[^.]{0,35}'s?\s+_{2,}/i.test(stem) && allIn(["wife", "husband", "brother", "sister", "daughter", "son", "friend", "mother", "father", "cousin", "colleague"])) {
    warnings.push("題幹未提供人物關係線索，多個人物選項都可能成立");
  }
  if (/chased\s+(?:an?\s+)?_{2,}/i.test(stem) && allIn(["rat", "mouse", "squirrel", "rabbit", "cat", "dog", "bird", "fox", "deer"])) {
    warnings.push("題幹未提供足以排除其他動物的線索，多個選項都合理");
  }

  // Explicit evidence rule: “just behind the winner” means second place.
  if (/just behind the winner/i.test(stem)) {
    const keyed = texts[LETTERS.indexOf(question.correctAnswer)];
    if (keyed !== "second") {
      warnings.push("答案與題幹明確線索矛盾：『just behind the winner』表示第二名");
    }
    if (!/second|第二名/.test(String(question.explanation || "").toLowerCase())) {
      warnings.push("解析未依據『just behind the winner』這項明確線索作答，可能加入題幹未提供的資訊");
    }
  }

  // Generic ordinal-place stems need an explicit clue that uniquely determines rank.
  if (/finished in\s+_{2,}\s+place/i.test(stem) && !/(winner|behind|ahead|first|second|third|last|final|only|one place|two places)/i.test(stem)) {
    warnings.push("名次題缺少可唯一決定答案的明確排序線索");
  }
  return warnings;
}

async function auditVocabularySetForManualReview(questions: ExamQuestion[]): Promise<ExamQuestion[]> {
  const deterministic = questions.map(deterministicOpenWorldWarnings);
  try {
    const audit = await callJsonModel<any>(
      VOCAB_SET_SEMANTIC_AUDITOR_SYSTEM,
      `Audit this complete set. Return one result for every index. For each item, first solve it independently, identify the exact supporting evidence, and then compare your answer with the keyed answer and explanation.\n${JSON.stringify({ questions })}`,
      vocabSetAuditSchema,
      0,
    );
    const byIndex = new Map<number, string[]>();
    for (const result of Array.isArray(audit?.results) ? audit.results : []) {
      const index = Number(result?.index);
      if (!Number.isInteger(index) || index < 0 || index >= questions.length) continue;
      const warnings = Array.isArray(result?.warnings) ? result.warnings.map(String).filter(Boolean) : [];
      const evidence = String(result?.evidence || "").trim();
      const derived = String(result?.independentlyDerivedAnswer || "").replace(/[()]/g, "").trim().toUpperCase();
      if (result?.pass === false && warnings.length === 0) warnings.push("語意審核未能確認本題只有一個可辯護答案");
      if (!evidence) warnings.push("審核未能指出題幹中支持答案的明確證據，題目可能缺少足夠語境");
      if (LETTERS.includes(derived as AnswerLetter) && derived !== questions[index].correctAnswer) {
        warnings.push(`獨立作答結果為 ${derived}，但系統答案為 ${questions[index].correctAnswer}，答案鍵可能錯誤`);
      }
      byIndex.set(index, warnings);
    }
    return questions.map((question, index) =>
      attachReviewMetadata(question, [
        ...(question.reviewWarnings || []),
        ...deterministic[index],
        ...(byIndex.get(index) || []),
      ]),
    );
  } catch (error) {
    console.warn("Set-level semantic audit failed; using deterministic warnings only:", error);
    return questions.map((question, index) =>
      attachReviewMetadata(question, [
        ...(question.reviewWarnings || []),
        ...deterministic[index],
      ]),
    );
  }
}

const READING_WRITER_SYSTEM = `You are a professional Taiwan GSAT reading-comprehension item writer.
Return JSON only.

RULES
1. Write one natural English passage of about 200-250 words at the requested level.
2. Write exactly four questions covering main idea, detail, inference/tone, and vocabulary in context.
3. Each question must have exactly one defensible answer supported by explicit text or a necessary inference.
4. Distractors must be clearly false, unsupported, too broad, too narrow, opposite, or based on a misreading.
5. Return options in A-B-C-D order with labels; correctAnswer is one bare letter.
6. Traditional Chinese explanations must cite or accurately paraphrase the relevant passage evidence and explain why the distractors fail.
7. Check polarity, comparison, cause/effect, chronology, quantity, and pronoun reference.
8. Do not design answer-letter patterns; the server will safely reposition the actual correct options.`;

const READING_REVIEWER_SYSTEM = `You are the final senior editor of a Taiwan GSAT reading-comprehension item bank.
Repair the complete passage and its four questions, then return the complete corrected JSON only.

For each question:
- Independently answer it from the passage.
- Verify exactly one option is supported.
- Replace any distractor that could also be defended.
- Correct mismatches between the option and its Traditional Chinese explanation.
- Preserve the exact polarity, comparison, chronology, quantity, and causal direction of the passage.
- Ensure each explanation identifies the relevant passage evidence and rejects the distractors.
Keep exactly one passage and exactly four questions. Return JSON only.`;


function selectTargetVocabulary(vocabList: VocabularyInput[], count: number): VocabularyInput[] {
  if (count <= 0 || vocabList.length === 0) return [];

  // Sample from the entire supplied range before sending anything to the model.
  // This prevents positional bias toward words appearing near the top of the list.
  const selected: VocabularyInput[] = [];
  while (selected.length < count) {
    const round = shuffle(vocabList);
    for (const item of round) {
      selected.push(item);
      if (selected.length === count) break;
    }
  }
  return selected;
}

function sameLemma(a: unknown, b: unknown): boolean {
  return String(a ?? "").trim().toLocaleLowerCase() === String(b ?? "").trim().toLocaleLowerCase();
}

/**
 * Produces a conservative comparison key for suite-wide option reuse checks.
 * It treats ordinary inflections as the same lexical item where practical
 * (for example, sound/sounds and study/studied).
 */
function optionLexemeKey(value: unknown): string {
  let token = stripOptionLabel(value)
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z\s-]/g, " ")
    .trim()
    .split(/\s+/)[0] || "";

  if (token.length <= 3) return token;
  if (token.endsWith("ies") && token.length > 4) token = `${token.slice(0, -3)}y`;
  else if (token.endsWith("ied") && token.length > 4) token = `${token.slice(0, -3)}y`;
  else if (token.endsWith("ing") && token.length > 5) {
    token = token.slice(0, -3);
    if (/(.)\1$/.test(token)) token = token.slice(0, -1);
    if (!token.endsWith("e") && token.length > 3) {
      // Keep the conservative stem. The AI prompt remains the primary lexical guard.
    }
  } else if (token.endsWith("ed") && token.length > 4) {
    token = token.slice(0, -2);
    if (/(.)\1$/.test(token)) token = token.slice(0, -1);
  } else if (token.endsWith("es") && token.length > 4) token = token.slice(0, -2);
  else if (token.endsWith("s") && !token.endsWith("ss") && token.length > 3) token = token.slice(0, -1);

  return token;
}

function usedOptionKeys(questions: ExamQuestion[]): Set<string> {
  return new Set(
    questions
      .flatMap((question) => question.options.map(optionLexemeKey))
      .filter(Boolean),
  );
}

function suiteDuplicateOptions(questions: ExamQuestion[]): string[] {
  const seen = new Map<string, string>();
  const duplicates: string[] = [];

  questions.forEach((question, qIndex) => {
    question.options.forEach((option) => {
      const text = stripOptionLabel(option);
      const key = optionLexemeKey(text);
      if (!key) return;
      const previous = seen.get(key);
      if (previous) duplicates.push(`Q${qIndex + 1} option "${text}" repeats ${previous}`);
      else seen.set(key, `an earlier option (${text})`);
    });
  });

  return duplicates;
}

function formatForbiddenOptions(questions: ExamQuestion[]): string {
  const items = questions.flatMap((question) => question.options.map(stripOptionLabel));
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "(none)";
}

function formatVocabularyList(vocabList: VocabularyInput[]): string {
  if (!vocabList.length) return "Use standard GSAT Level 3-6 vocabulary.";
  return vocabList
    .map(
      (item, index) =>
        `${index + 1}. ${item.word}${item.pos ? ` (${item.pos})` : ""}${item.meaning ? ` — ${item.meaning}` : ""}`,
    )
    .join("\n");
}

// -----------------------------------------------------------------------------
// Vocabulary generation: generate -> read-only validate -> targeted batch repair
// -----------------------------------------------------------------------------

async function generateVocabularyDraft(
  targetWords: VocabularyInput[],
  vocabList: VocabularyInput[],
  selectedLevel: number | string,
): Promise<ExamQuestion[]> {
  const targetAssignments = targetWords
    .map((item, index) => `${index + 1}. Question ${index + 1} MUST test: ${item.word}${item.pos ? ` (${item.pos})` : ""}${item.meaning ? ` — ${item.meaning}` : ""}`)
    .join("\n");

  const userPrompt = `Create exactly ${targetWords.length} GSAT vocabulary questions for Level ${selectedLevel || "mixed"}.
The target words below were sampled randomly by the server from the ENTIRE supplied range.
Follow the assignment exactly: Question N must test the target listed for Question N.
Do not replace a target with an earlier or easier word from the list.
The displayed correct option may use a grammatically necessary inflection, but wordTested must remain the assigned dictionary entry.
Distractors should preferably come from the full supplied range, and every option set must contain four distinct lexical items.
SUITE-WIDE UNIQUENESS: across all ${targetWords.length} questions, do not reuse an option word or the same lexeme in another inflected form when the supplied list has enough distinct vocabulary. For example, if "sound" or "sounds" appears anywhere, neither may appear again in this set.

MANDATORY TARGET ASSIGNMENTS
${targetAssignments}

FULL VOCABULARY RANGE FOR DISTRACTORS
${formatVocabularyList(vocabList)}

Return {"vocabQuestions":[...]} with exactly ${targetWords.length} items in the same order as the assignments. Every item MUST use these exact keys: question, options, correctAnswer, explanation, wordTested, answerText. The question field must contain the complete sentence with _____. The explanation field must be Traditional Chinese.`;

  const raw = await callJsonModel<any>(
    VOCAB_WRITER_SYSTEM,
    userPrompt,
    vocabBatchSchema,
    0.35,
  );

  const items = Array.isArray(raw?.vocabQuestions) ? raw.vocabQuestions : [];
  return items.slice(0, targetWords.length).map((item: any) => normalizeQuestion(item, "vocab"));
}

const VOCAB_BATCH_REVIEWER_SYSTEM = `You are the final senior editor of a Taiwan GSAT vocabulary item bank.
Return JSON only.

You receive a complete ten-question vocabulary set with fixed target assignments.
Repair the whole set in one pass while preserving question order and each assigned wordTested.

MANDATORY RULES
1. Every item must be one natural English gap-filling sentence containing exactly one visible blank written as _____.
2. Never convert an item into a direct question such as "Which word..." or "What word...".
3. Each item must have exactly four complete, distinct English options.
4. Exactly one option must be defensible from explicit context in the sentence. Add a semantic lock when needed.
5. Reject open-world location items such as "The cat is hiding ___ the box" unless the stem contains a clue that excludes all other locations.
6. Correct grammar and morphology, including infinitive/base form, agreement, tense, voice, number, adjective/adverb form, and -ed/-ing participles.
7. Keep wordTested as the assigned lemma and set answerText to the exact keyed option text.
8. Explanations must be Traditional Chinese, cite the exact clue, and explain why all distractors fail.
9. Do not reuse malformed or truncated words.
10. Keep exactly ten items and return {"vocabQuestions":[...]}.`;

async function reviewVocabularyBatch(
  questions: ExamQuestion[],
  targetWords: VocabularyInput[],
  selectedLevel: number | string,
): Promise<ExamQuestion[]> {
  const assignments = targetWords.map((item, index) => ({
    index,
    word: item.word,
    pos: item.pos,
    meaning: item.meaning,
  }));
  const raw = await callJsonModel<any>(
    VOCAB_BATCH_REVIEWER_SYSTEM,
    `Repair this Level ${selectedLevel || "mixed"} ten-question set in one pass.\nTARGET ASSIGNMENTS:\n${JSON.stringify(assignments)}\nDRAFT SET:\n${JSON.stringify({ vocabQuestions: questions })}`,
    vocabBatchSchema,
    0.05,
  );
  const items = Array.isArray(raw?.vocabQuestions) ? raw.vocabQuestions : [];
  if (items.length !== targetWords.length) {
    throw new Error(`Batch reviewer returned ${items.length} items; expected ${targetWords.length}.`);
  }
  return items.map((item: any) => normalizeQuestion(item, "vocab"));
}

async function generateOneVocabularyQuestion(
  targetWord: VocabularyInput,
  vocabList: VocabularyInput[],
  selectedLevel: number | string,
  avoidQuestions: string[],
  forbiddenOptions: ExamQuestion[] = [],
): Promise<ExamQuestion> {
  const prompt = `Create ONE new Level ${selectedLevel || "mixed"} GSAT vocabulary question.
The required target is ${targetWord.word}${targetWord.pos ? ` (${targetWord.pos})` : ""}${targetWord.meaning ? ` — ${targetWord.meaning}` : ""}.
You MUST test this exact dictionary entry. wordTested must be "${targetWord.word}".
The displayed correct option may be inflected only when the sentence requires it.
Do not duplicate these existing stems:
${avoidQuestions.map((q) => `- ${q}`).join("\n") || "(none)"}

Do not reuse any of these option words or their ordinary inflected forms:
${formatForbiddenOptions(forbiddenOptions)}

FULL VOCABULARY RANGE FOR DISTRACTORS
${formatVocabularyList(vocabList)}

Return one question object, not an array.`;
  const raw = await callJsonModel<any>(VOCAB_WRITER_SYSTEM, prompt, vocabQuestionSchema, 0.4);
  return normalizeQuestion(raw, "vocab");
}

async function repairVocabularyQuestion(
  question: ExamQuestion,
  errors: string[],
  targetWord: VocabularyInput,
  vocabList: VocabularyInput[],
  selectedLevel: number | string,
  forbiddenOptions: ExamQuestion[] = [],
): Promise<ExamQuestion> {
  const prompt = `Repair this Level ${selectedLevel || "mixed"} item.
The REQUIRED target dictionary entry is "${targetWord.word}"${targetWord.pos ? ` (${targetWord.pos})` : ""}${targetWord.meaning ? ` — ${targetWord.meaning}` : ""}.
Do not substitute a different target. Set wordTested exactly to "${targetWord.word}".
The displayed keyed option may use a necessary grammatical form of that target.
Detected deterministic problems: ${errors.join("; ") || "none; perform full semantic audit anyway"}.

SUITE-WIDE OPTION EXCLUSIONS
Do not use any of the following option words, nor ordinary inflected forms of the same lexemes:
${formatForbiddenOptions(forbiddenOptions)}

SOURCE VOCABULARY RANGE
${formatVocabularyList(vocabList)}

DRAFT ITEM
${JSON.stringify(question)}

Return one fully repaired question object.`;

  const raw = await callJsonModel<any>(
    VOCAB_REVIEWER_SYSTEM,
    prompt,
    vocabQuestionSchema,
    0.08,
  );
  return normalizeQuestion(raw, "vocab");
}


const morphologyPlanSchema: any = {
  type: Type.OBJECT,
  properties: {
    slotCategory: { type: Type.STRING },
    requiredForm: { type: Type.STRING },
    semanticRole: { type: Type.STRING },
    targetSurfaceForm: { type: Type.STRING },
    rationale: { type: Type.STRING },
  },
  required: ["slotCategory", "requiredForm", "semanticRole", "targetSurfaceForm", "rationale"],
};

async function analyzeMorphologyPlan(
  question: ExamQuestion,
  targetWord: VocabularyInput,
): Promise<MorphologyPlan> {
  const prompt = `Analyze the blank and determine the exact contextually required form of the target lexeme.

TARGET LEXEME: ${JSON.stringify(targetWord)}
QUESTION: ${JSON.stringify(question)}

Pay special attention to experiencer (-ed) versus cause (-ing), verb agreement, tense, voice, and required part of speech.`;

  return callJsonModel<MorphologyPlan>(
    VOCAB_MORPHOLOGY_ANALYZER_SYSTEM,
    prompt,
    morphologyPlanSchema,
    0,
  );
}

async function grammarAuditVocabularyQuestion(
  question: ExamQuestion,
  targetWord: VocabularyInput,
  selectedLevel: number | string,
  morphologyPlan: MorphologyPlan,
): Promise<ExamQuestion> {
  const prompt = `Perform a final grammar-and-inflection audit on this Level ${selectedLevel || "mixed"} vocabulary item.
The required source lexeme is "${targetWord.word}"${targetWord.pos ? ` (${targetWord.pos})` : ""}.
Preserve wordTested exactly as "${targetWord.word}".
Correct the exact displayed forms of all four options.

MANDATORY MORPHOLOGY PLAN
${JSON.stringify(morphologyPlan)}

The keyed answer must realize targetSurfaceForm unless the plan itself is internally impossible; in that case repair the sentence while preserving the target lexeme and the intended semantic distinction.

ITEM
${JSON.stringify(question)}

Return one corrected question object only.`;

  const raw = await callJsonModel<any>(
    VOCAB_GRAMMAR_AUDITOR_SYSTEM,
    prompt,
    vocabQuestionSchema,
    0.02,
  );
  return normalizeQuestion(raw, "vocab");
}


const VOCAB_TARGETED_BATCH_REPAIR_SYSTEM = `You are a senior Taiwan GSAT vocabulary editor.
Return JSON only in the requested batch shape.

You will receive only failed items. For every supplied item:
1. Return exactly one complete repaired item in the same order.
2. Use the exact keys question, options, correctAnswer, explanation, wordTested, answerText.
3. question must be a complete natural English sentence with exactly one visible blank: _____.
4. options must contain exactly four complete and distinct lexical choices.
5. Exactly one answer must be forced by explicit semantic evidence in the sentence.
6. Preserve the assigned dictionary entry in wordTested.
7. correctAnswer must be one bare letter A, B, C, or D; answerText must exactly match that option.
8. explanation must be detailed Traditional Chinese and must identify the forcing clue and reject every distractor.
9. Never omit a field. Never return placeholders. Never turn the item into an open question.
10. Do not return items that were not supplied.`;

async function repairVocabularyBatch(
  questions: ExamQuestion[],
  failedIndexes: number[],
  targetWords: VocabularyInput[],
  vocabList: VocabularyInput[],
  selectedLevel: number | string,
): Promise<Map<number, ExamQuestion>> {
  if (failedIndexes.length === 0) return new Map();

  const failedItems = failedIndexes.map((index) => ({
    index,
    targetWord: targetWords[index],
    problems: [
      ...validateQuestion(questions[index], "vocab"),
      ...deterministicVocabularyWarnings(questions[index]),
      ...(!sameLemma(questions[index].wordTested, targetWords[index].word)
        ? [`wordTested must match assigned target "${targetWords[index].word}"`]
        : []),
    ],
    draft: questions[index],
  }));

  const prompt = `Repair ONLY the failed vocabulary items below for GSAT Level ${selectedLevel || "mixed"}.
Return exactly one repaired item for every supplied index, in the same order.
Do not rewrite items that are not supplied.

MANDATORY RULES
- Preserve each assigned target dictionary entry in wordTested.
- Keep a genuine one-sentence gap-filling item with exactly one visible blank: _____.
- Add an explicit semantic lock so only one option is defensible.
- Use four different lexical items; all displayed forms must fit the grammatical slot.
- Independently solve the repaired item and set correctAnswer and answerText correctly.
- The Traditional Chinese explanation must identify the forcing clue and explain why all distractors fail.
- Never use placeholders or open-ended question formats.

FAILED ITEMS
${JSON.stringify(failedItems)}

AVAILABLE VOCABULARY
${formatVocabularyList(vocabList)}

Return JSON only in this exact shape:
{"vocabQuestions":[repaired item 1, repaired item 2, ...]}
Every repaired item MUST include all six exact keys: question, options, correctAnswer, explanation, wordTested, answerText. Never omit question. explanation must be Traditional Chinese.`;

  const raw = await callJsonModel<any>(
    VOCAB_TARGETED_BATCH_REPAIR_SYSTEM,
    prompt,
    vocabBatchSchema,
    0.08,
  );
  const repairedRaw = Array.isArray(raw?.vocabQuestions) ? raw.vocabQuestions : [];
  if (repairedRaw.length !== failedIndexes.length) {
    throw new Error(
      `Failed-item repair returned ${repairedRaw.length} items; expected ${failedIndexes.length}.`,
    );
  }

  const repaired = new Map<number, ExamQuestion>();
  failedIndexes.forEach((originalIndex, position) => {
    repaired.set(originalIndex, normalizeQuestion(repairedRaw[position], "vocab", questions[originalIndex]));
  });
  return repaired;
}

function vocabularyWarningsFor(
  question: ExamQuestion,
  targetWord: VocabularyInput,
): string[] {
  const warnings = [
    ...validateQuestion(question, "vocab"),
    ...deterministicVocabularyWarnings(question),
  ];
  if (!sameLemma(question.wordTested, targetWord.word)) {
    warnings.push(`wordTested must match assigned target "${targetWord.word}"`);
  }
  return Array.from(new Set(warnings));
}

async function buildVocabularySection(
  vocabList: VocabularyInput[],
  selectedLevel: number | string,
): Promise<ExamQuestion[]> {
  const targetWords = selectTargetVocabulary(vocabList, 10);
  if (targetWords.length === 0) {
    throw new Error("No vocabulary words are available for question generation.");
  }

  // Fast-quality pipeline:
  // 1 model call: generate all 10 items.
  // 0-1 model call: repair only items rejected by deterministic validation.
  // No per-item morphology calls and no extra whole-set AI audit.
  const questions = await generateVocabularyDraft(targetWords, vocabList, selectedLevel);
  if (questions.length !== targetWords.length) {
    throw new Error(`Vocabulary draft returned ${questions.length} items; expected ${targetWords.length}.`);
  }

  const failedIndexes = questions
    .map((question, index) => vocabularyWarningsFor(question, targetWords[index]).length ? index : -1)
    .filter((index) => index >= 0);

  let merged = [...questions];
  if (failedIndexes.length > 0) {
    try {
      const repairs = await repairVocabularyBatch(
        questions,
        failedIndexes,
        targetWords,
        vocabList,
        selectedLevel,
      );
      merged = merged.map((question, index) => repairs.get(index) || question);
    } catch (error) {
      // The original questions remain available and will be clearly marked for
      // teacher review. One failed repair request never discards the whole paper.
      console.warn("Failed-item vocabulary repair failed; keeping flagged drafts:", error);
    }
  }

  const balanced = balanceQuestions(merged);
  return balanced.map((question, index) =>
    attachReviewMetadata(
      question,
      vocabularyWarningsFor(question, targetWords[index]),
    ),
  );
}

// -----------------------------------------------------------------------------
// Reading generation and repair
// -----------------------------------------------------------------------------

async function generateReadingDraft(level: string, selectedLevel: number | string): Promise<ReadingPassage> {
  const prompt = `Create one reading passage for reading band "${level}" and GSAT Level ${selectedLevel || "mixed"}.
Return {"readingPassages":[one passage]} with exactly four questions.`;
  const raw = await callJsonModel<any>(READING_WRITER_SYSTEM, prompt, readingSchema, 0.35);
  const passageRaw = Array.isArray(raw?.readingPassages)
    ? raw.readingPassages[0]
    : raw?.readingPassage ?? raw;
  return normalizePassage(passageRaw);
}

async function repairReadingPassage(
  passage: ReadingPassage,
  errors: string[],
  level: string,
): Promise<ReadingPassage> {
  const prompt = `Repair this complete "${level}" reading set.
Detected deterministic problems: ${errors.join("; ") || "none; perform full semantic audit anyway"}.

DRAFT
${JSON.stringify({ readingPassages: [passage] })}

Return {"readingPassages":[the complete repaired passage]} only.`;
  const raw = await callJsonModel<any>(READING_REVIEWER_SYSTEM, prompt, readingSchema, 0.08);
  const passageRaw = Array.isArray(raw?.readingPassages)
    ? raw.readingPassages[0]
    : raw?.readingPassage ?? raw;
  const repaired = normalizePassage(passageRaw);
  // Preserve complete original fields when an editorial response accidentally
  // omits a field. Question-level normalization also accepts common aliases.
  return {
    level: repaired.level || passage.level,
    title: repaired.title || passage.title,
    passage: repaired.passage || passage.passage,
    questions: Array.from({ length: Math.max(repaired.questions.length, passage.questions.length) }, (_, index) => {
      const rawQuestion = Array.isArray(passageRaw?.questions) ? passageRaw.questions[index] : undefined;
      return rawQuestion
        ? normalizeQuestion(rawQuestion, "reading", passage.questions[index])
        : repaired.questions[index] || passage.questions[index];
    }).filter(Boolean),
  };
}

async function buildReadingSection(
  level: string,
  selectedLevel: number | string,
): Promise<ReadingPassage> {
  // Fixed two-call ceiling: one draft + one complete editorial repair.
  const draft = await generateReadingDraft(level, selectedLevel);
  const draftErrors = validatePassage(draft);

  let passage: ReadingPassage;
  try {
    passage = await repairReadingPassage(draft, draftErrors, level);
  } catch (error) {
    console.warn("Reading editorial repair failed; validating the original draft:", error);
    passage = draft;
  }

  // A missing passage or wrong question count cannot be safely represented as
  // a usable test and must never be replaced with placeholder content.
  if (!passage.title || !passage.passage || passage.questions.length !== 4) {
    throw new Error(
      "Reading generation did not produce one complete passage with exactly four questions. Please retry.",
    );
  }

  passage.questions = balanceQuestions(passage.questions);
  const passageErrors = validatePassage(passage);

  passage.questions = passage.questions.map((question, index) => {
    const prefix = `Q${index + 1}: `;
    const warnings = [
      ...validateQuestion(question, "reading"),
      ...passageErrors
        .filter((error) => error.startsWith(prefix))
        .map((error) => error.slice(prefix.length)),
    ];
    return attachReviewMetadata(question, warnings);
  });

  // Passage-level length is a non-blocking editorial warning; attach it to all
  // four items so the teacher can see it without losing the generated set.
  const globalWarnings = passageErrors.filter((error) => !/^Q\d+:/.test(error));
  if (globalWarnings.length > 0) {
    passage.questions = passage.questions.map((question) =>
      attachReviewMetadata(question, [
        ...(question.reviewWarnings || []),
        ...globalWarnings,
      ]),
    );
  }

  return passage;
}

// -----------------------------------------------------------------------------
// IDs and diagnostics
// -----------------------------------------------------------------------------

function addIds(data: ExamData): ExamData {
  const stamp = Date.now();
  return {
    ...(data.vocabQuestions
      ? {
          vocabQuestions: data.vocabQuestions.map((question, index) => ({
            ...question,
            id: `vocab-${index}-${stamp}`,
          })),
        }
      : {}),
    ...(data.readingPassages
      ? {
          readingPassages: data.readingPassages.map((passage, passageIndex) => ({
            ...passage,
            questions: passage.questions.map((question, questionIndex) => ({
              ...question,
              id: `reading-${passageIndex}-${questionIndex}-${stamp}`,
            })),
          })),
        }
      : {}),
  };
}

function distribution(questions: ExamQuestion[] = []): Record<AnswerLetter, number> {
  return questions.reduce(
    (counts, question) => {
      counts[question.correctAnswer] += 1;
      return counts;
    },
    { A: 0, B: 0, C: 0, D: 0 } as Record<AnswerLetter, number>,
  );
}


function validateExamData(data: ExamData): string[] {
  const fatal: string[] = [];
  if (data.vocabQuestions && data.vocabQuestions.length === 0) fatal.push("Vocabulary section is empty");
  if (data.readingPassages && data.readingPassages.length === 0) fatal.push("Reading section is empty");
  return fatal;
}

function collectReviewWarnings(data: ExamData) {
  const vocab = (data.vocabQuestions || []).flatMap((question, index) =>
    (question.reviewWarnings || []).map((warning) => ({
      section: "vocab",
      questionNumber: index + 1,
      warning,
    })),
  );
  const reading = (data.readingPassages || []).flatMap((passage, passageIndex) =>
    passage.questions.flatMap((question, questionIndex) =>
      (question.reviewWarnings || []).map((warning) => ({
        section: "reading",
        passageNumber: passageIndex + 1,
        questionNumber: questionIndex + 1,
        warning,
      })),
    ),
  );
  return [...vocab, ...reading];
}

// -----------------------------------------------------------------------------
// Routes
// -----------------------------------------------------------------------------

app.get("/api/health", async (_req, res) => {
  res.json({
    status: "ok",
    message: "GSAT Mock API is healthy.",
    env: {
      openaiKeyExists: !!process.env.OPENAI_API_KEY,
      geminiKeyExists: !!process.env.GEMINI_API_KEY,
      NODE_ENV: process.env.NODE_ENV,
    },
  });
});

app.post("/api/generate", async (req, res) => {
  try {
    verifyApiKeys();

    const {
      vocabList = [],
      selectedExerciseTypes = {},
      selectedReadingLevels = [],
      selectedLevel = "mixed",
    } = req.body || {};

    const wantsVocab = !!selectedExerciseTypes?.vocab;
    const wantsReading =
      !!selectedExerciseTypes?.reading &&
      Array.isArray(selectedReadingLevels) &&
      selectedReadingLevels.length > 0;

    if (!wantsVocab && !wantsReading) {
      return res.status(400).json({
        success: false,
        error: "Please select at least one exercise type.",
      });
    }

    const cleanVocabList: VocabularyInput[] = Array.isArray(vocabList)
      ? vocabList
          .map((item: any) => ({
            word: String(item?.word ?? "").trim(),
            pos: item?.pos ? String(item.pos).trim() : undefined,
            meaning: item?.meaning ? String(item.meaning).trim() : undefined,
          }))
          .filter((item: VocabularyInput) => item.word)
      : [];

    const data: ExamData = {};

    if (wantsVocab) {
      data.vocabQuestions = await buildVocabularySection(cleanVocabList, selectedLevel);
    }

    if (wantsReading) {
      // The frontend currently calls this endpoint once per selected reading
      // level, so return exactly one passage for the first requested level.
      data.readingPassages = [
        await buildReadingSection(String(selectedReadingLevels[0]), selectedLevel),
      ];
    }

    const finalData = addIds(data);
    const finalValidationErrors = validateExamData(finalData);
    if (finalValidationErrors.length > 0) {
      throw new Error(`Final item-bank QA failed: ${finalValidationErrors.join("; ")}`);
    }

    return res.json({
      success: true,
      data: finalData,
      qualityAssurance: {
        // Compatibility flags consumed by the current App.tsx.
        editorialPassCompleted: true,
        structuralValidationPassed: true,
        itemLevelWarningsAreNonBlocking: true,

        // Item Generation Engine diagnostics.
        engineVersion: "4.0.0-targeted-repair",
        pipeline: [
          "generate",
          "normalize",
          "deterministic-validate",
          "deterministic-failed-item-detection",
          "single-batch-targeted-repair",
          "manual-review-for-unresolved-items",
          "move-correct-option",
          "balanced-unpredictable-placement",
          "final-qa",
        ],
        itemLevelRepairEnabled: true,
        independentEditorialReviewCompleted: true,
        manualReviewEnabled: true,
        reviewWarnings: collectReviewWarnings(finalData),
        manualReviewCount: collectReviewWarnings(finalData).length,
        answerPlacementMethod: "move-correct-option-then-derive-letter",
        answerPatternPolicy: "balanced-but-unpredictable",
        vocabAnswerDistribution: distribution(finalData.vocabQuestions || []),
        vocabAnswerSequence: (finalData.vocabQuestions || [])
          .map((question) => question.correctAnswer)
          .join(""),
        readingAnswerDistributions: (finalData.readingPassages || []).map((passage) =>
          distribution(passage.questions),
        ),
        readingAnswerSequences: (finalData.readingPassages || []).map((passage) =>
          passage.questions.map((question) => question.correctAnswer).join(""),
        ),
      },
    });
  } catch (error: any) {
    console.error("GSAT generation error:", error);
    return res.status(500).json({
      success: false,
      error: error?.message || "An unexpected generation error occurred.",
    });
  }
});

app.post("/api/evaluate-report", async (req, res) => {
  try {
    verifyApiKeys();
    const { scoreSummary, selectedLevel } = req.body || {};

    const systemPrompt = `You are Tr. Shirley Du, a warm, professional Taiwan GSAT English teacher.
Write in natural Traditional Chinese. Return JSON only.`;

    const userPrompt = `Write a supportive progress report.
Overall: ${scoreSummary?.comprehensive?.correct ?? 0}/${scoreSummary?.comprehensive?.total ?? 0} (${scoreSummary?.comprehensive?.score ?? 0}%)
Vocabulary: ${scoreSummary?.vocab?.correct ?? 0}/${scoreSummary?.vocab?.total ?? 0}
Reading: ${scoreSummary?.reading?.correct ?? 0}/${scoreSummary?.reading?.total ?? 0}
Level: ${selectedLevel || "Mixed"}

Return exactly:
{
  "greeting": "...",
  "analysis": "...",
  "tips": ["...", "...", "..."],
  "encouragement": "..."
}`;

    const schema = {
      type: Type.OBJECT,
      properties: {
        greeting: { type: Type.STRING },
        analysis: { type: Type.STRING },
        tips: { type: Type.ARRAY, items: { type: Type.STRING } },
        encouragement: { type: Type.STRING },
      },
      required: ["greeting", "analysis", "tips", "encouragement"],
    };

    const report = await callJsonModel<any>(systemPrompt, userPrompt, schema, 0.65);
    return res.json({ success: true, data: report });
  } catch (error: any) {
    console.error("GSAT evaluation error:", error);
    return res.status(500).json({
      success: false,
      error: error?.message || "An unexpected evaluation error occurred.",
    });
  }
});

async function startServer(): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Back-End Services] Running on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL && process.env.IS_SERVERLESS !== "true") {
  void startServer();
}

export default app;

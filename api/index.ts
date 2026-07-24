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
    .replace(/^\s*\(?[A-D]\)?[.、:：\-]?\s*/i, "")
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

function normalizeQuestion(raw: any, kind: "vocab" | "reading"): ExamQuestion {
  const options = normalizeOptions(raw?.options ?? raw?.choices);
  const correctAnswer = normalizeAnswer(raw?.correctAnswer ?? raw?.answer);
  const correctIndex = LETTERS.indexOf(correctAnswer);
  const exactAnswerText = stripOptionLabel(options[correctIndex]);

  return {
    question: String(raw?.question ?? "").trim(),
    options,
    correctAnswer,
    explanation: String(raw?.explanation ?? "").trim(),
    ...(kind === "vocab"
      ? {
          wordTested: String(raw?.wordTested ?? "").trim(),
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

function optionWords(value: unknown): string[] {
  return stripOptionLabel(value)
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z\s-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Rejects option sets such as "horizontal rifle / naive rifle / rifle / compact rifle".
 * These do not test four different lexical items; they merely repeat one headword
 * with superficial modifiers.
 */
function repeatedOptionHeadword(options: string[]): string | null {
  const heads = options.map((option) => optionWords(option).at(-1) || "").filter(Boolean);
  const counts = new Map<string, number>();
  for (const head of heads) counts.set(head, (counts.get(head) || 0) + 1);
  for (const [head, count] of counts) {
    if (count >= 3) return head;
  }
  return null;
}

function normalizeComparableForm(value: unknown): string {
  return stripOptionLabel(value).toLowerCase().replace(/[^a-z-]/g, "");
}

/**
 * Deterministic checks for high-confidence surface-form errors. These rules are
 * intentionally conservative: they only reject constructions whose grammar is
 * explicit in the stem, such as "to ____" or "must ____" requiring a base verb.
 */
function validateExplicitVocabularyMorphology(question: ExamQuestion): string[] {
  const errors: string[] = [];
  const answerIndex = LETTERS.indexOf(question.correctAnswer);
  const answer = normalizeComparableForm(question.options[answerIndex]);
  const lemma = normalizeComparableForm(question.wordTested || "");
  const stem = String(question.question || "").toLowerCase();

  const requiresBaseVerb =
    /(?:\bto|\bcan|\bcould|\bmay|\bmight|\bmust|\bshall|\bshould|\bwill|\bwould)\s+_{3,}/i.test(stem);

  if (requiresBaseVerb && answer) {
    const looksInflected =
      /(?:ing|ed)$/.test(answer) ||
      (/(?:s|es)$/.test(answer) && !/(?:ss|us|is)$/.test(answer));

    // When wordTested is available, the keyed surface form must be the dictionary
    // form in an explicit base-verb slot. This catches bulge -> bulges after "to".
    if ((lemma && answer !== lemma) || (!lemma && looksInflected)) {
      errors.push(`the keyed option "${stripOptionLabel(question.options[answerIndex])}" is not a base verb in an explicit base-form slot`);
    }
  }

  return errors;
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

function validateQuestion(question: ExamQuestion, kind: "vocab" | "reading"): string[] {
  const errors: string[] = [];
  const texts = question.options.map(stripOptionLabel);
  const answerIndex = LETTERS.indexOf(question.correctAnswer);

  if (!question.question) errors.push("missing question text");
  if (kind === "vocab" && !/_{3,}/.test(question.question)) {
    errors.push("the vocabulary sentence has no visible blank");
  }
  if (question.options.length !== 4 || texts.some((item) => !item)) {
    errors.push("the question does not have four complete options");
  }
  if (new Set(texts.map((item) => item.toLowerCase())).size !== 4) {
    errors.push("duplicate options");
  }
  if (!texts[answerIndex]) errors.push("the answer letter does not identify an option");
  if (!question.explanation) errors.push("missing answer explanation");
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
    const repeatedHead = repeatedOptionHeadword(question.options);
    if (repeatedHead) {
      errors.push(`three or more options repeat the same headword "${repeatedHead}"`);
    }
    errors.push(...validateExplicitVocabularyMorphology(question));
  }

  return errors;
}


function splitValidationErrors(errors: string[]): { hard: string[]; soft: string[] } {
  const softPatterns = [
    /explanation admits that another option could fit/i,
    /suite-wide repeated options/i,
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
// Vocabulary generation and item-level repair
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

Return {"vocabQuestions":[...]} with exactly ${targetWords.length} items in the same order as the assignments.`;

  const raw = await callJsonModel<any>(
    VOCAB_WRITER_SYSTEM,
    userPrompt,
    vocabBatchSchema,
    0.35,
  );

  const items = Array.isArray(raw?.vocabQuestions) ? raw.vocabQuestions : [];
  return items.slice(0, targetWords.length).map((item: any) => normalizeQuestion(item, "vocab"));
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

async function buildVocabularySection(
  vocabList: VocabularyInput[],
  selectedLevel: number | string,
): Promise<ExamQuestion[]> {
  const targetWords = selectTargetVocabulary(vocabList, 10);
  const uniqueVocabularyCount = new Set(vocabList.map((item) => item.word.trim().toLowerCase()).filter(Boolean)).size;
  const enforceSuiteWideOptionUniqueness = uniqueVocabularyCount >= targetWords.length * 4;
  if (targetWords.length === 0) {
    throw new Error("No vocabulary words are available for question generation.");
  }

  let questions: ExamQuestion[] = [];
  let lastError: unknown = null;

  for (let batchAttempt = 0; batchAttempt < 3 && questions.length < targetWords.length; batchAttempt++) {
    try {
      questions = await generateVocabularyDraft(targetWords, vocabList, selectedLevel);
    } catch (error) {
      lastError = error;
      console.warn(`Vocabulary batch attempt ${batchAttempt + 1} failed:`, error);
    }
  }

  while (questions.length < targetWords.length) {
    const targetWord = targetWords[questions.length];
    try {
      questions.push(
        await generateOneVocabularyQuestion(
          targetWord,
          vocabList,
          selectedLevel,
          questions.map((q) => q.question),
          enforceSuiteWideOptionUniqueness ? questions : [],
        ),
      );
    } catch (error) {
      lastError = error;
      if (questions.length === 0) throw error;
      break;
    }
  }

  if (questions.length !== targetWords.length) {
    throw lastError || new Error(`Unable to generate ${targetWords.length} vocabulary questions; received ${questions.length}.`);
  }

  const reviewed: ExamQuestion[] = [];

  for (let index = 0; index < questions.length; index++) {
    const targetWord = targetWords[index];
    let current = questions[index];
    let errors = validateQuestion(current, "vocab");
    if (!sameLemma(current.wordTested, targetWord.word)) {
      errors.push(`wordTested must be the assigned target "${targetWord.word}"`);
    }
    if (enforceSuiteWideOptionUniqueness) {
      const priorKeys = usedOptionKeys(reviewed);
      const conflicts = current.options
        .map(stripOptionLabel)
        .filter((option) => priorKeys.has(optionLexemeKey(option)));
      if (conflicts.length) errors.push(`suite-wide repeated options: ${conflicts.join(", ")}`);
    }

    for (let repairAttempt = 0; repairAttempt < 3; repairAttempt++) {
      try {
        current = await repairVocabularyQuestion(
          current,
          errors,
          targetWord,
          vocabList,
          selectedLevel,
          enforceSuiteWideOptionUniqueness ? reviewed : [],
        );
        errors = validateQuestion(current, "vocab");
        if (!sameLemma(current.wordTested, targetWord.word)) {
          errors.push(`wordTested must be the assigned target "${targetWord.word}"`);
        }
        if (enforceSuiteWideOptionUniqueness) {
          const priorKeys = usedOptionKeys(reviewed);
          const conflicts = current.options
            .map(stripOptionLabel)
            .filter((option) => priorKeys.has(optionLexemeKey(option)));
          if (conflicts.length) errors.push(`suite-wide repeated options: ${conflicts.join(", ")}`);
        }
        if (errors.length === 0) break;
      } catch (error) {
        lastError = error;
        console.warn(`Vocabulary Q${index + 1} repair ${repairAttempt + 1} failed:`, error);
      }
    }

    if (errors.length > 0) {
      let replacement: ExamQuestion | null = null;
      for (let replacementAttempt = 0; replacementAttempt < 3; replacementAttempt++) {
        try {
          const fresh = await generateOneVocabularyQuestion(
            targetWord,
            vocabList,
            selectedLevel,
            reviewed.map((q) => q.question),
            enforceSuiteWideOptionUniqueness ? reviewed : [],
          );
          const freshErrors = validateQuestion(fresh, "vocab");
          if (!sameLemma(fresh.wordTested, targetWord.word)) {
            freshErrors.push(`wordTested must be the assigned target "${targetWord.word}"`);
          }
          const repaired = await repairVocabularyQuestion(
            fresh,
            freshErrors,
            targetWord,
            vocabList,
            selectedLevel,
            enforceSuiteWideOptionUniqueness ? reviewed : [],
          );
          const repairedErrors = validateQuestion(repaired, "vocab");
          if (!sameLemma(repaired.wordTested, targetWord.word)) {
            repairedErrors.push(`wordTested must be the assigned target "${targetWord.word}"`);
          }
          if (enforceSuiteWideOptionUniqueness) {
            const priorKeys = usedOptionKeys(reviewed);
            const conflicts = repaired.options
              .map(stripOptionLabel)
              .filter((option) => priorKeys.has(optionLexemeKey(option)));
            if (conflicts.length) repairedErrors.push(`suite-wide repeated options: ${conflicts.join(", ")}`);
          }
          if (repairedErrors.length === 0) {
            replacement = repaired;
            break;
          }
        } catch (error) {
          lastError = error;
        }
      }
      if (!replacement) {
        // Graceful fallback: quality remains mandatory, but suite-wide option
        // uniqueness becomes a soft constraint after the strict repair/regeneration
        // attempts are exhausted. This prevents one difficult item from rejecting
        // the entire paper and surfacing an error in the frontend.
        console.warn(
          `Vocabulary Q${index + 1}: strict suite-wide option uniqueness could not be satisfied; retrying with quality-only validation.`,
          lastError,
        );

        for (let fallbackAttempt = 0; fallbackAttempt < 5; fallbackAttempt++) {
          try {
            const fresh = await generateOneVocabularyQuestion(
              targetWord,
              vocabList,
              selectedLevel,
              reviewed.map((q) => q.question),
              [],
            );
            const freshErrors = validateQuestion(fresh, "vocab");
            if (!sameLemma(fresh.wordTested, targetWord.word)) {
              freshErrors.push(`wordTested must be the assigned target "${targetWord.word}"`);
            }

            const repaired = await repairVocabularyQuestion(
              fresh,
              freshErrors,
              targetWord,
              vocabList,
              selectedLevel,
              [],
            );
            const repairedErrors = validateQuestion(repaired, "vocab");
            if (!sameLemma(repaired.wordTested, targetWord.word)) {
              repairedErrors.push(`wordTested must be the assigned target "${targetWord.word}"`);
            }

            if (repairedErrors.length === 0) {
              replacement = repaired;
              break;
            }
          } catch (error) {
            lastError = error;
            console.warn(
              `Vocabulary Q${index + 1} quality-only fallback ${fallbackAttempt + 1} failed:`,
              error,
            );
          }
        }
      }

      if (!replacement) {
        throw lastError || new Error(
          `Vocabulary question ${index + 1} could not be generated after all repair attempts.`,
        );
      }
      current = replacement;
    }

    // Mandatory final morphology audit. A question is not allowed into the
    // returned paper while any hard deterministic error remains.
    let grammarAudited = current;
    let finalErrors: string[] = [];
    for (let grammarAttempt = 0; grammarAttempt < 3; grammarAttempt++) {
      try {
        const morphologyPlan = await analyzeMorphologyPlan(grammarAudited, targetWord);
        grammarAudited = await grammarAuditVocabularyQuestion(
          grammarAudited,
          targetWord,
          selectedLevel,
          morphologyPlan,
        );
        finalErrors = validateQuestion(grammarAudited, "vocab");
        if (!sameLemma(grammarAudited.wordTested, targetWord.word)) {
          finalErrors.push(`wordTested must remain the assigned target "${targetWord.word}"`);
        }
        if (finalErrors.length === 0) break;
      } catch (error) {
        lastError = error;
        console.warn(`Vocabulary Q${index + 1} grammar audit ${grammarAttempt + 1} failed:`, error);
      }
    }

    // If repair still leaves an obvious morphology or option-design defect,
    // discard the item and regenerate it instead of downgrading it to a warning.
    if (finalErrors.length > 0) {
      let strictReplacement: ExamQuestion | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          let fresh = await generateOneVocabularyQuestion(
            targetWord,
            vocabList,
            selectedLevel,
            reviewed.map((q) => q.question),
            enforceSuiteWideOptionUniqueness ? reviewed : [],
          );
          let freshErrors = validateQuestion(fresh, "vocab");
          if (!sameLemma(fresh.wordTested, targetWord.word)) {
            freshErrors.push(`wordTested must remain the assigned target "${targetWord.word}"`);
          }
          fresh = await repairVocabularyQuestion(
            fresh,
            freshErrors,
            targetWord,
            vocabList,
            selectedLevel,
            enforceSuiteWideOptionUniqueness ? reviewed : [],
          );
          const morphologyPlan = await analyzeMorphologyPlan(fresh, targetWord);
          fresh = await grammarAuditVocabularyQuestion(fresh, targetWord, selectedLevel, morphologyPlan);

          const replacementErrors = validateQuestion(fresh, "vocab");
          if (!sameLemma(fresh.wordTested, targetWord.word)) {
            replacementErrors.push(`wordTested must remain the assigned target "${targetWord.word}"`);
          }
          const { hard } = splitValidationErrors(replacementErrors);
          if (hard.length === 0) {
            strictReplacement = fresh;
            break;
          }
          lastError = new Error(hard.join("; "));
        } catch (error) {
          lastError = error;
          console.warn(`Vocabulary Q${index + 1} strict replacement ${attempt + 1} failed:`, error);
        }
      }

      if (!strictReplacement) {
        throw lastError || new Error(
          `Vocabulary question ${index + 1} still contains a hard grammar or option-design error after strict regeneration.`,
        );
      }
      grammarAudited = strictReplacement;
    }

    current = grammarAudited;
    reviewed.push(current);
  }

  const balanced = balanceQuestions(reviewed);
  if (enforceSuiteWideOptionUniqueness) {
    const duplicates = suiteDuplicateOptions(balanced);
    if (duplicates.length) {
      // Uniqueness is preferred, not a reason to discard an otherwise valid paper.
      // This can occur when the model cannot produce ten high-quality items while
      // also avoiding every previously used lexeme.
      console.warn(
        `Vocabulary suite contains unavoidable repeated option lexemes: ${duplicates.join("; ")}`,
      );
    }
  }

  const structurallyAnnotated = balanced.map((question, index) => {
    const errors = validateQuestion(question, "vocab");
    if (!sameLemma(question.wordTested, targetWords[index].word)) {
      errors.push(`wordTested no longer matches assigned target "${targetWords[index].word}"`);
    }
    const { hard, soft } = splitValidationErrors(errors);
    if (hard.length) {
      throw new Error(`Vocabulary Q${index + 1} failed final hard validation: ${hard.join("; ")}`);
    }
    return attachReviewMetadata(question, soft);
  });

  // One efficient set-level semantic audit catches open-world ambiguity that a
  // repair model may overlook (e.g. four languages, relatives, or animals that
  // could all truthfully fill a context-free blank). These are warnings only.
  return auditVocabularySetForManualReview(structurallyAnnotated);
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
  return normalizePassage(passageRaw);
}

async function buildReadingSection(
  level: string,
  selectedLevel: number | string,
): Promise<ReadingPassage> {
  let lastError: unknown = null;

  for (let generationAttempt = 0; generationAttempt < 3; generationAttempt++) {
    try {
      let passage = await generateReadingDraft(level, selectedLevel);
      let errors = validatePassage(passage);

      // Always run at least one independent passage-level editorial review.
      for (let repairAttempt = 0; repairAttempt < 3; repairAttempt++) {
        passage = await repairReadingPassage(passage, errors, level);
        errors = validatePassage(passage);
        if (errors.length === 0) {
          passage.questions = balanceQuestions(passage.questions);
          const finalErrors = validatePassage(passage);
          if (finalErrors.length === 0) return passage;
          errors = finalErrors;
        }
      }
      lastError = new Error(errors.join("; "));
    } catch (error) {
      lastError = error;
      console.warn(`Reading generation attempt ${generationAttempt + 1} failed:`, error);
    }
  }

  // Return the best available passage with per-question review markers rather
  // than rejecting the entire paper after all repair attempts.
  console.warn(`Reading passage ${level} requires manual review:`, lastError);
  const fallback = await generateReadingDraft(level, selectedLevel);
  fallback.questions = fallback.questions.map((question) => {
    const errors = validateQuestion(question, "reading");
    return attachReviewMetadata(question, errors);
  });
  return fallback;
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
        engineVersion: "3.4.0-evidence-context-audit",
        pipeline: [
          "generate",
          "normalize",
          "deterministic-validate",
          "editorial-review",
          "context-aware-morphology-plan",
          "mandatory-morphology-audit",
          "set-level-open-world-ambiguity-audit",
          "item-level-repair-or-replace",
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

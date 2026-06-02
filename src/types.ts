/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface VocabWord {
  level: string;
  unit: string;
  no: string;
  word: string;
  pos: string;
  meaning: string;
  id: string;
}

export interface VocabQuestion {
  id: string;
  question: string;
  options: string[]; // EXACTLY 4 choices, formatted as: ["(A) word1", "(B) word2", "(C) word3", "(D) word4"]
  correctAnswer: string; // "A" | "B" | "C" | "D"
  wordTested: string;
  explanation: string; // Detailed Traditional Chinese explanation
}

export interface ClozeQuestion {
  gapNumber: number; // 1 to 5
  question: string; // The prompt question (e.g., "Choice for blank (1)")
  options: string[]; // EXACTLY 4 choices, e.g. ["(A) word1", "(B) word2", "(C) word3", "(D) word4"]
  correctAnswer: string; // "A" | "B" | "C" | "D"
  category: string; // "vocabulary" | "grammar" | "collocation" | "idiom" | "discourse"
  explanation: string; // Traditional Chinese analysis
}

export interface ClozeSection {
  passage: string; // The full passage containing gaps like (1), (2), (3), (4), (5).
  questions: ClozeQuestion[];
}

export interface BlankMatchingSection {
  passage: string; // Passage containing 10 blanks numbered (1) to (10).
  options: string[]; // 10 highly deceptive matching options (e.g., lettered (A) to (J))
  answers: string[]; // Array of 10 answers, e.g., ["C", "A", "I"...] corresponding to blanks (1) to (10)
  explanations: string[]; // 10 explanations corresponding to blanks (1) to (10)
}

export interface ReadingQuestion {
  id: string;
  question: string;
  options: string[]; // EXACTLY 4 choices, displayed on separate lines
  correctAnswer: string; // "A" | "B" | "C" | "D"
  explanation: string; // Tr. Chinese explanation
}

export interface ReadingPassage {
  level: "basic" | "essential" | "advanced";
  title: string;
  passage: string;
  questions: ReadingQuestion[];
}

export interface GeneratedExamSuite {
  vocabQuestions?: VocabQuestion[];
  clozeSuite?: ClozeSection;
  blankMatchingSuite?: BlankMatchingSection;
  readingPassages?: ReadingPassage[];
  timestamp: number;
  metadata: {
    vocabCount: number;
    sourceType: "system" | "self-input";
    selectedLevel: number;
    selectedUnits: string[];
  };
}

export interface PracticeSessionState {
  answers: {
    vocab: { [questionId: string]: string }; // e.g., { "vocab-1": "A" }
    cloze: { [gapNumber: number]: string }; // e.g., { 1: "C" }
    blankMatching: { [blankIndex: number]: string }; // e.g., { 0: "B" } (index 0 to 9 for blanks 1 to 10)
    reading: { [passageIndex_questionId: string]: string }; // e.g., { "0-reading-1": "D" }
  };
  submitted: boolean;
  startTime: number;
  endTime?: number;
}

export interface ProgressReport {
  sessionId: string;
  timestamp: number;
  durationMs: number;
  scoreSummary: {
    vocab: { correct: number; total: number; score: number };
    cloze: { correct: number; total: number; score: number };
    blankMatching: { correct: number; total: number; score: number };
    reading: { correct: number; total: number; score: number };
    comprehensive: { correct: number; total: number; score: number };
  };
  details: {
    section: "vocab" | "cloze" | "blankMatching" | "reading";
    questionNumberOrName: string;
    isCorrect: boolean;
    userAnswer: string;
    correctAnswer: string;
    questionText?: string;
  }[];
  expertFeedback: string; // AI teacher Shirley Du's progress commentary in Traditional Chinese, warm and helpful.
}

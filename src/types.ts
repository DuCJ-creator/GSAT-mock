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
  options: string[]; // EXACTLY 4 choices: ["(A) word1", "(B) word2", "(C) word3", "(D) word4"]
  correctAnswer: string; // "A" | "B" | "C" | "D"
  wordTested: string;
  explanation: string; // Traditional Chinese explanation
  _warning?: string;   // Server-side flag if answer word appears in question
}

export interface ReadingQuestion {
  id: string;
  question: string;
  options: string[]; // EXACTLY 4 choices
  correctAnswer: string; // "A" | "B" | "C" | "D"
  explanation: string; // Traditional Chinese explanation
}

export interface ReadingPassage {
  level: "basic" | "essential" | "advanced";
  title: string;
  passage: string;
  questions: ReadingQuestion[];
}

export interface GeneratedExamSuite {
  vocabQuestions?: VocabQuestion[];
  readingPassages?: ReadingPassage[];
  timestamp: number;
  metadata: {
    vocabCount: number;
    sourceType: "system" | "self-input";
    selectedLevel: number;
    selectedUnits: string[];
    vocabList?: any[];
  };
}

export interface PracticeSessionState {
  answers: {
    vocab: { [questionIndex: string]: string };   // e.g. { "vocab_0": "B" }
    reading: { [passageIdx_questionIdx: string]: string }; // e.g. { "0_1": "D" }
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
    reading: { correct: number; total: number; score: number };
    comprehensive: { correct: number; total: number; score: number };
  };
  details: {
    section: "vocab" | "reading";
    questionNumberOrName: string;
    isCorrect: boolean;
    userAnswer: string;
    correctAnswer: string;
    questionText?: string;
    wordTested?: string;
    wordMeta?: { level?: number; unit?: string };
  }[];
  expertFeedback: string;
  selectedLevel?: number;
}

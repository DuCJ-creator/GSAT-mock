/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Copy, Printer, FileText, CheckSquare, Eye, ArrowLeft, Download, FileSpreadsheet, Laptop } from "lucide-react";
import { GeneratedExamSuite } from "../types";

interface WorksheetExportProps {
  suite: GeneratedExamSuite;
  onBack: () => void;
}

export default function WorksheetExport({ suite, onBack }: WorksheetExportProps) {
  const [includeExplanations, setIncludeExplanations] = useState(true);
  const [previewMode, setPreviewMode] = useState<"full" | "questions" | "answers">("full");
  const [copied, setCopied] = useState(false);

  // Helper to generate the plain-text/markdown content for copying
  const generateMarkdown = () => {
    let md = `# GSAT English Mock Paper Creator - English V/R Practice Worksheet\n`;
    md += `## Designed by Tr. Shirley Du (學測英文模擬試卷）\n\n`;
    md += `Class: ______________  Name: ______________  Date: ______________  Score: ______________\n`;
    md += `========================================================================\n\n`;

    // Part I: Vocab
    if (suite.vocabQuestions && suite.vocabQuestions.length > 0) {
      md += `### Part I: Multiple-Choice Questions (學測字彙單選題)\n`;
      md += `*Directions: Choose the best word to fill in each blank and complete the sentence.*\n\n`;
      suite.vocabQuestions.forEach((q, idx) => {
        md += `(   ) ${idx + 1}. ${q.question}\n`;
        md += `   ${q.options.join("   ")}\n\n`;
      });
      md += `\n`;
    }

    // Part II: Reading (Move Reading here so it is Part II)
    if (suite.readingPassages && suite.readingPassages.length > 0) {
      md += `### Part II: Reading Comprehension (學測閱讀測驗)\n`;
      md += `*Directions: Read the following passages and choose the best answer for each question.*\n\n`;
      suite.readingPassages.forEach((p, pIdx) => {
        md += `[Passage ${pIdx + 1}] Level: ${p.level.toUpperCase()} - ${p.title}\n`;
        md += `${p.passage}\n\n`;
        p.questions.forEach((q, qIdx) => {
          md += `  (   ) ${qIdx + 1}. ${q.question}\n`;
          q.options.forEach((opt) => {
            md += `     ${opt}\n`;
          });
          md += `\n`;
        });
        md += `\n`;
      });
    }

    // Part III: Cloze
    if (suite.clozeSuite) {
      md += `### Part III: Cloze Test (學測綜合測驗)\n`;
      md += `*Directions: Read the passage and choose the best option for each blank.*\n\n`;
      md += `${suite.clozeSuite.passage}\n\n`;
      suite.clozeSuite.questions.forEach((q) => {
        md += `(   ) (${q.gapNumber}) ${q.options.join("   ")}\n`;
      });
      md += `\n\n`;
    }

    // Part IV: Matching
    if (suite.blankMatchingSuite) {
      md += `### Part IV: Blank Matching (學測文意選填)\n`;
      md += `*Directions: Choose the correct word from the options below to fill in each blank matching slot in the passage.*\n\n`;
      md += `Options:\n`;
      md += `   ${suite.blankMatchingSuite.options.join("   ")}\n\n`;
      md += `${suite.blankMatchingSuite.passage}\n\n`;
    }

    md += `\n\n========================================================================\n`;
    md += `### ANSWER KEY & EXPLANATIONS (解答與詳解)\n`;
    md += `========================================================================\n\n`;

    if (suite.vocabQuestions && suite.vocabQuestions.length > 0) {
      md += `#### Part I Vocabulary Solution:\n`;
      suite.vocabQuestions.forEach((q, idx) => {
        md += `${idx + 1}. Correct Answer: (${q.correctAnswer}) - Word Tested: ${q.wordTested}\n`;
        if (includeExplanations) {
          md += `   解析: ${q.explanation}\n\n`;
        }
      });
      md += `\n`;
    }

    if (suite.readingPassages && suite.readingPassages.length > 0) {
      md += `#### Part II Reading Comprehension Solution:\n`;
      suite.readingPassages.forEach((p, pIdx) => {
        md += `[Passage ${pIdx + 1}] - ${p.title}\n`;
        p.questions.forEach((q, qIdx) => {
          md += `  Question ${qIdx + 1}: Correct Answer: (${q.correctAnswer})\n`;
          if (includeExplanations) {
            md += `     解析: ${q.explanation}\n\n`;
          }
        });
        md += `\n`;
      });
    }

    if (suite.clozeSuite) {
      md += `#### Part III Cloze Solution:\n`;
      suite.clozeSuite.questions.forEach((q) => {
        md += `Gap (${q.gapNumber}) Correct Answer: (${q.correctAnswer}) [Category: ${q.category}]\n`;
        if (includeExplanations) {
          md += `   解析: ${q.explanation}\n\n`;
        }
      });
      md += `\n`;
    }

    if (suite.blankMatchingSuite) {
      md += `#### Part IV Blank Matching Solution:\n`;
      md += `Blanks (1) through (10) Answers:\n`;
      suite.blankMatchingSuite.answers.forEach((ans, idx) => {
        md += `(${idx + 1}): ${ans}  (Word: ${suite.blankMatchingSuite!.options.find(o => o.startsWith(`(${ans})`)) || ans})\n`;
        if (includeExplanations) {
          md += `     解析: ${suite.blankMatchingSuite!.explanations[idx]}\n`;
        }
      });
      md += `\n`;
    }

    return md;
  };

  const handleCopy = () => {
    const text = generateMarkdown();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadTxt = () => {
    const text = generateMarkdown();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `GSAT_Buffet_Worksheet_${Date.now()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadInteractiveHtml = () => {
    // Keep the embedded exam data human-readable so teachers can edit the
    // downloaded HTML directly in GitHub or any text editor.
    // Escape only sequences that could prematurely close the JSON script block.
    const serializedData = JSON.stringify(suite, null, 2)
      .replace(/<\/script/gi, "<\\/script")
      .replace(/<!--/g, "<\\!--");
    
    const htmlContent = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GSAT English Mock Practice - Student Interactive Platform</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500&display=swap');
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }
    .serif-font {
      font-family: 'Times New Roman', 'Times', 'Playfair Display', Georgia, serif;
    }
    .mono-font {
      font-family: 'JetBrains Mono', monospace;
    }
    .choice-btn {
      transition: all 0.2s ease;
    }
    .choice-btn:hover:not(:disabled) {
      background-color: #f5f5f4;
      border-color: #78716c;
    }
    .choice-selected {
      background-color: #fdf6e2 !important;
      border-color: #b45309 !important;
      color: #78350f !important;
      font-weight: 600;
    }
    @media print {
      .no-print {
        display: none !important;
      }
      body {
        background-color: white !important;
        color: black !important;
        padding: 0 !important;
      }
      .print-full-width {
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        box-shadow: none !important;
        border: none !important;
      }
    }
  </style>
</head>
<body class="bg-stone-50 text-stone-900 min-h-screen">
  <div class="max-w-7xl mx-auto px-4 py-6 md:py-10">
    <!-- Top Brand Header -->
    <header class="mb-8 border-b-2 border-stone-800 pb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div>
        <h1 class="text-xl md:text-2xl font-bold uppercase tracking-tight text-stone-950">GSAT English Interactive Practice Platform</h1>
        <p class="text-xs text-amber-800 font-semibold mt-0.5">學測英文模擬試卷 • 學生自學互動練習系統 • Designed by Tr. Shirley Du</p>
      </div>
      <div class="no-print flex items-center gap-3">
        <button onclick="window.print()" class="px-3 py-1.5 bg-white border border-stone-300 text-stone-700 hover:bg-stone-50 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
          Print Page
        </button>
      </div>
    </header>

    <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <!-- Left sidebar with timer, student details, and navigation/progress indicators -->
      <aside class="no-print lg:col-span-1 space-y-6">
        <!-- Timer Card -->
        <div class="bg-stone-900 text-stone-100 rounded-2xl p-5 border border-stone-800 shadow-sm">
          <span class="text-[10px] tracking-widest uppercase text-stone-400 block font-bold mb-1">Session Stopwatch</span>
          <div class="flex items-center gap-3">
            <svg class="w-6 h-6 text-amber-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <div class="text-2xl font-bold tracking-wider font-mono text-amber-400" id="stopwatch-display">00:00</div>
          </div>
        </div>

        <!-- Student Info form -->
        <div class="bg-white rounded-2xl p-5 border border-stone-200 shadow-sm space-y-3">
          <h3 class="text-sm font-bold text-stone-900 border-b border-stone-100 pb-2">Student Directory (個人資料)</h3>
          <div>
            <label class="block text-[11px] font-semibold text-stone-500 uppercase mb-1">Class (班級)</label>
            <input type="text" id="student-class" placeholder="e.g. 301" class="w-full px-3 py-1.5 border border-stone-200 rounded-lg text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-500">
          </div>
          <div>
            <label class="block text-[11px] font-semibold text-stone-500 uppercase mb-1">Name (姓名)</label>
            <input type="text" id="student-name" placeholder="e.g. 林大明" class="w-full px-3 py-1.5 border border-stone-200 rounded-lg text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-500">
          </div>
          <div>
            <label class="block text-[11px] font-semibold text-stone-500 uppercase mb-1">Seat Number (座號)</label>
            <input type="text" id="student-number" placeholder="e.g. 15" class="w-full px-3 py-1.5 border border-stone-200 rounded-lg text-sm bg-stone-50/50 focus:outline-none focus:ring-2 focus:ring-stone-500">
          </div>
        </div>

        <!-- Progress Navigator Panel -->
        <div class="bg-white rounded-2xl p-5 border border-stone-200 shadow-sm space-y-4">
          <h3 class="text-sm font-bold text-stone-900 border-b border-stone-100 pb-2">Navigation & Progress</h3>
          <nav class="space-y-1.5" id="nav-list">
            <!-- Dynamic navigation anchors -->
          </nav>

          <button id="submit-btn" onclick="triggerSubmit()" class="w-full py-3 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-bold tracking-wider uppercase transition shadow-sm hover:shadow flex items-center justify-center gap-1.5">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            Submit Answer Sheet
          </button>
        </div>
      </aside>

      <!-- Main container with the questions -->
      <main class="lg:col-span-3 space-y-8 print-full-width">
        <!-- Solution Summary Dashboard (Hidden until submitted) -->
        <div id="results-dashboard" class="hidden bg-stone-900 text-stone-100 rounded-3xl p-6 md:p-8 border border-stone-800 shadow-lg space-y-6">
          <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div>
              <span class="inline-block bg-amber-500 text-stone-950 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full mb-2">Practice Report Card</span>
              <h2 class="text-xl md:text-2xl font-bold text-white">Your Evaluation Breakdown</h2>
              <p class="text-xs text-stone-400 mt-1" id="student-report-stamp"></p>
            </div>
            
            <div class="flex items-center gap-4">
              <!-- Score Gauge -->
              <div class="relative flex items-center justify-center w-24 h-24 rounded-full border-4 border-stone-800 bg-stone-950">
                <div class="text-center">
                  <span class="text-2xl font-extrabold text-amber-400 font-mono" id="score-percentage">0%</span>
                  <span class="text-[9px] block text-stone-500 tracking-wide font-semibold mt-0.5" id="score-ratio">0/0 Qs</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Tr. Shirley Du feedback block -->
          <div class="bg-stone-950/80 border border-stone-800 rounded-2xl p-5">
            <div class="flex items-center gap-2 mb-2">
              <span class="text-amber-500 font-bold text-sm">【Tr. Shirley Du 老師的診斷講評】</span>
            </div>
            <p id="shirley-feedback" class="text-stone-300 text-xs leading-relaxed"></p>
          </div>

          <!-- Buttons -->
          <div class="no-print flex flex-wrap gap-2 pt-2">
            <button onclick="window.print()" class="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
              Print Graded Sheet
            </button>
            <button onclick="resetPractice()" class="px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H17"></path></svg>
              Retake Practice
            </button>
          </div>
        </div>

        <div id="quiz-container" class="space-y-10">
          <!-- Sections will be generated here -->
        </div>
      </main>
    </div>
  </div>

  <!-- Exit Warning Modal -->
  <div id="submit-confirm-modal" class="hidden no-print fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
    <div class="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl border border-stone-200">
      <h3 class="text-lg font-bold text-stone-950 mb-2">Submit Your Worksheet</h3>
      <p class="text-sm text-stone-600 mb-4" id="modal-warning-text">Are you sure you want to grade your worksheet? Once submitted, your answers will be evaluated instantly.</p>
      <div class="flex justify-end gap-3 text-xs font-bold">
        <button onclick="closeSubmitModal()" class="px-4 py-2.5 border border-stone-300 text-stone-600 hover:bg-stone-50 rounded-xl transition">
          Go Back
        </button>
        <button onclick="executeSubmit()" class="px-5 py-2.5 bg-amber-800 hover:bg-amber-900 text-white rounded-xl transition shadow-sm">
          Yes, Grade Now
        </button>
      </div>
    </div>
  </div>

  <!-- =====================================================
       TEACHER EDIT AREA / 教師人工編輯區
       You may directly edit questions, options, correctAnswer, wordTested,
       answerText, explanations, passages, and other exam content below.
       Keep the JSON syntax valid and do not remove the surrounding script tag.
  ====================================================== -->
  <script id="exam-data" type="application/json">
${serializedData}
  </script>

  <script>
    // Load the human-readable embedded exam data.
    const examDataElement = document.getElementById("exam-data");
    if (!examDataElement) {
      throw new Error("Embedded exam data was not found.");
    }
    const EXAM_DATA = JSON.parse(examDataElement.textContent || "{}");

    // State object
    let state = {
      answers: {
        vocab: {},       // idx -> "A"|"B"|"C"|"D"
        reading: {},     // pIdx_qIdx -> "A"|"B"|"C"|"D"
        cloze: {},       // idx -> "A"|"B"|"C"|"D"
        matching: {}     // idx -> chosen letter
      },
      submitted: false,
      startTime: Date.now(),
      elapsedSeconds: 0,
      timerInterval: null
    };

    // Initialize application
    window.addEventListener('DOMContentLoaded', () => {
      buildQuiz();
      buildNav();
      startStopwatch();
    });

    function startStopwatch() {
      state.startTime = Date.now();
      state.timerInterval = setInterval(() => {
        if (!state.submitted) {
          state.elapsedSeconds = Math.floor((Date.now() - state.startTime) / 1000);
          updateStopwatchUI();
        }
      }, 1000);
    }

    function updateStopwatchUI() {
      const minutes = Math.floor(state.elapsedSeconds / 60).toString().padStart(2, '0');
      const seconds = (state.elapsedSeconds % 60).toString().padStart(2, '0');
      document.getElementById('stopwatch-display').innerText = \`\${minutes}:\${seconds}\`;
    }

    // Build left sidebar navigator elements dynamically based on available parts
    function buildNav() {
      const navContainer = document.getElementById('nav-list');
      navContainer.innerHTML = '';

      let idx = 1;
      
      if (EXAM_DATA.vocabQuestions && EXAM_DATA.vocabQuestions.length > 0) {
        createNavButton(navContainer, 'section-vocab', \`Part \${romanize(idx)}: Vocabulary\`, () => countAnswered('vocab'), EXAM_DATA.vocabQuestions.length);
        idx++;
      }
      if (EXAM_DATA.readingPassages && EXAM_DATA.readingPassages.length > 0) {
        let totalQ = 0;
        EXAM_DATA.readingPassages.forEach(p => totalQ += p.questions.length);
        createNavButton(navContainer, 'section-reading', \`Part \${romanize(idx)}: Reading Comp\`, () => countAnswered('reading'), totalQ);
        idx++;
      }
      if (EXAM_DATA.clozeSuite && EXAM_DATA.clozeSuite.questions.length > 0) {
        createNavButton(navContainer, 'section-cloze', \`Part \${romanize(idx)}: Cloze Test\`, () => countAnswered('cloze'), EXAM_DATA.clozeSuite.questions.length);
        idx++;
      }
      if (EXAM_DATA.blankMatchingSuite) {
        createNavButton(navContainer, 'section-matching', \`Part \${romanize(idx)}: Blank Matching\`, () => countAnswered('matching'), 10);
        idx++;
      }
    }

    function romanize(num) {
      if (num === 1) return 'I';
      if (num === 2) return 'II';
      if (num === 3) return 'III';
      if (num === 4) return 'IV';
      return num;
    }

    function createNavButton(container, targetId, title, getAnsweredCount, totalCount) {
      const btn = document.createElement('a');
      btn.href = \`#\${targetId}\`;
      btn.className = "flex items-center justify-between px-3 py-2 text-xs text-stone-600 hover:bg-stone-50 hover:text-stone-900 rounded-lg transition font-medium border border-transparent";
      btn.id = \`nav-link-\${targetId}\`;
      
      const textSpan = document.createElement('span');
      textSpan.innerText = title;
      btn.appendChild(textSpan);

      const statusSpan = document.createElement('span');
      statusSpan.className = "font-mono text-[10px] bg-stone-100 px-1.5 py-0.5 rounded font-bold text-stone-500";
      statusSpan.id = \`nav-counter-\${targetId}\`;
      statusSpan.innerText = \`\${getAnsweredCount()}/\${totalCount}\`;
      btn.appendChild(statusSpan);

      container.appendChild(btn);
    }

    function countAnswered(sectionKey) {
      return Object.keys(state.answers[sectionKey] || {}).filter(k => state.answers[sectionKey][k] !== "").length;
    }

    function updateNavCounters() {
      let idx = 1;
      if (EXAM_DATA.vocabQuestions && EXAM_DATA.vocabQuestions.length > 0) {
        const counter = document.getElementById('nav-counter-section-vocab');
        if (counter) counter.innerText = \`\${countAnswered('vocab')}/\${EXAM_DATA.vocabQuestions.length}\`;
        idx++;
      }
      if (EXAM_DATA.readingPassages && EXAM_DATA.readingPassages.length > 0) {
        const counter = document.getElementById('nav-counter-section-reading');
        let totalQ = 0;
        EXAM_DATA.readingPassages.forEach(p => totalQ += p.questions.length);
        if (counter) counter.innerText = \`\${countAnswered('reading')}/\${totalQ}\`;
        idx++;
      }
      if (EXAM_DATA.clozeSuite && EXAM_DATA.clozeSuite.questions.length > 0) {
        const counter = document.getElementById('nav-counter-section-cloze');
        if (counter) counter.innerText = \`\${countAnswered('cloze')}/\${EXAM_DATA.clozeSuite.questions.length}\`;
        idx++;
      }
      if (EXAM_DATA.blankMatchingSuite) {
        const counter = document.getElementById('nav-counter-section-matching');
        if (counter) counter.innerText = \`\${countAnswered('matching')}/10\`;
        idx++;
      }
    }

    // Build the main exam questions list
    function buildQuiz() {
      const container = document.getElementById('quiz-container');
      container.innerHTML = '';

      let partCounter = 1;

      // Part 1: Vocabulary Questions
      if (EXAM_DATA.vocabQuestions && EXAM_DATA.vocabQuestions.length > 0) {
        const section = document.createElement('section');
        section.id = "section-vocab";
        section.className = "bg-white border border-stone-200 rounded-3xl p-6 md:p-8 shadow-sm space-y-6";
        
        section.innerHTML = \`
          <div class="border-l-4 border-stone-800 pl-3">
            <h2 class="text-lg font-bold text-stone-900 uppercase">Part \${romanize(partCounter)}: Vocabulary Questions (學測字彙單選題)</h2>
            <p class="text-xs text-stone-500 italic mt-0.5">Directions: Choose the best word that grammatically and contextually makes the sentence meaningful.</p>
          </div>
          <div class="space-y-6 mt-4" id="vocab-questions-list"></div>
        \`;
        container.appendChild(section);
        
        const list = document.getElementById('vocab-questions-list');
        EXAM_DATA.vocabQuestions.forEach((q, qIdx) => {
          const qBlock = document.createElement('div');
          qBlock.className = "p-4 rounded-xl hover:bg-stone-50/50 transition border border-transparent";
          qBlock.id = \`vocab-q-block-\${qIdx}\`;
          
          let optionsHtml = '';
          q.options.forEach((opt, optIdx) => {
            const letter = ["A", "B", "C", "D"][optIdx];
            optionsHtml += \`
              <button onclick="selectAnswer('vocab', '\${qIdx}', '\${letter}')" id="vocab-btn-\${qIdx}-\${letter}" class="choice-btn text-left px-4 py-2 text-xs md:text-sm border border-stone-200 rounded-xl bg-white text-stone-700 font-medium">
                \${opt}
              </button>
            \`;
          });

          qBlock.innerHTML = \`
            <div class="text-sm md:text-base leading-relaxed text-stone-900 font-serif">
              <span class="font-bold mr-2 text-stone-800 font-mono inline-block">\${qIdx + 1}.</span>
              \${q.question}
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              \${optionsHtml}
            </div>
            <!-- Feedback explanation card (shown after submit) -->
            <div id="vocab-expl-\${qIdx}" class="hidden mt-4 p-4 rounded-xl border"></div>
          \`;
          list.appendChild(qBlock);
        });

        partCounter++;
      }

      // Part 2: Reading Comprehension
      if (EXAM_DATA.readingPassages && EXAM_DATA.readingPassages.length > 0) {
        const section = document.createElement('section');
        section.id = "section-reading";
        section.className = "bg-white border border-stone-200 rounded-3xl p-6 md:p-8 shadow-sm space-y-8";
        
        section.innerHTML = \`
          <div class="border-l-4 border-stone-800 pl-3">
            <h2 class="text-lg font-bold text-stone-900 uppercase">Part \${romanize(partCounter)}: Reading Comprehension (學測閱讀測驗)</h2>
            <p class="text-xs text-stone-500 italic mt-0.5">Directions: Read each of the following passages and complete the multiple-choice comprehension questions that follow.</p>
          </div>
          <div class="space-y-12 mt-6" id="reading-passages-list"></div>
        \`;
        container.appendChild(section);

        const list = document.getElementById('reading-passages-list');
        EXAM_DATA.readingPassages.forEach((p, pIdx) => {
          const passageBlock = document.createElement('div');
          passageBlock.className = "space-y-6";
          
          let questionsHtml = '';
          p.questions.forEach((q, qIdx) => {
            const compositeKey = \`\${pIdx}_\${qIdx}\`;
            let choicesHtml = '';
            q.options.forEach((opt, optIdx) => {
              const letter = ["A", "B", "C", "D"][optIdx];
              choicesHtml += \`
                <button onclick="selectAnswer('reading', '\${compositeKey}', '\${letter}')" id="reading-btn-\${compositeKey}-\${letter}" class="choice-btn text-left px-4 py-2 text-xs md:text-sm border border-stone-200 rounded-xl bg-white text-stone-700 font-medium w-full">
                  \${opt}
                </button>
              \`;
            });

            questionsHtml += \`
              <div class="p-4 rounded-xl hover:bg-stone-50/50 transition border border-transparent" id="reading-q-block-\${compositeKey}">
                <div class="text-sm md:text-base leading-relaxed text-stone-900 font-serif">
                  <span class="font-bold mr-2 text-stone-800 font-mono">\${qIdx + 1}.</span>
                  \${q.question}
                </div>
                <div class="flex flex-col gap-2 mt-3 pl-2">
                  \${choicesHtml}
                </div>
                <div id="reading-expl-\${compositeKey}" class="hidden mt-4 p-4 rounded-xl border"></div>
              </div>
            \`;
          });

          passageBlock.innerHTML = \`
            <div class="space-y-3 bg-amber-50/20 border border-amber-900/10 p-5 md:p-6 rounded-2xl">
              <div class="bg-amber-500/10 border border-amber-900/10 px-2.5 py-0.5 inline-block text-[10px] font-mono uppercase tracking-wider text-amber-900 rounded-md font-bold mb-1">
                Level: \${p.level}
              </div>
              <h3 class="text-base md:text-lg font-bold font-serif text-stone-950">Passage \${pIdx + 1}: \${p.title}</h3>
              <p class="serif-font text-stone-800 leading-relaxed text-sm md:text-base whitespace-pre-wrap">\${p.passage}</p>
            </div>
            
            <div class="space-y-4 pt-2">
              <h4 class="text-xs font-bold uppercase tracking-wider text-stone-400 pl-4 font-mono">Comprehension Questions</h4>
              \${questionsHtml}
            </div>
          \`;
          list.appendChild(passageBlock);
        });

        partCounter++;
      }

      // Part 3: Cloze Test Questions
      if (EXAM_DATA.clozeSuite && EXAM_DATA.clozeSuite.questions.length > 0) {
        const section = document.createElement('section');
        section.id = "section-cloze";
        section.className = "bg-white border border-stone-200 rounded-3xl p-6 md:p-8 shadow-sm space-y-6";
        
        section.innerHTML = \`
          <div class="border-l-4 border-stone-800 pl-3">
            <h2 class="text-lg font-bold text-stone-900 uppercase">Part \${romanize(partCounter)}: Cloze Test (學測綜合測驗)</h2>
            <p class="text-xs text-stone-500 italic mt-0.5">Directions: For each blank, choose the most appropriate word, conjugation, preposition, or collocation phrase.</p>
          </div>
          
          <div class="bg-stone-50 border border-stone-200 rounded-2xl p-5 md:p-6 text-sm md:text-base leading-loose text-stone-900 serif-font whitespace-pre-wrap">\${EXAM_DATA.clozeSuite.passage}</div>
          
          <div class="space-y-4 pt-4" id="cloze-questions-list"></div>
        \`;
        container.appendChild(section);

        const list = document.getElementById('cloze-questions-list');
        EXAM_DATA.clozeSuite.questions.forEach((q, qIdx) => {
          const qBlock = document.createElement('div');
          qBlock.className = "p-4 rounded-xl hover:bg-stone-50/50 transition border border-transparent";
          qBlock.id = \`cloze-q-block-\${qIdx}\`;
          
          let optionsHtml = '';
          q.options.forEach((opt, optIdx) => {
            const letter = ["A", "B", "C", "D"][optIdx];
            optionsHtml += \`
              <button onclick="selectAnswer('cloze', '\${qIdx}', '\${letter}')" id="cloze-btn-\${qIdx}-\${letter}" class="choice-btn text-left px-4 py-2 text-xs md:text-sm border border-stone-200 rounded-xl bg-white text-stone-700 font-medium">
                \${opt}
              </button>
            \`;
          });

          qBlock.innerHTML = \`
            <div class="text-sm md:text-base leading-relaxed text-stone-900 font-semibold flex items-center gap-2 font-serif">
              <span class="inline-block px-2 py-0.5 bg-stone-100 text-stone-800 rounded font-bold font-mono text-xs">Blank (\${q.gapNumber})</span>
              Choice selection:
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              \${optionsHtml}
            </div>
            <div id="cloze-expl-\${qIdx}" class="hidden mt-4 p-4 rounded-xl border"></div>
          \`;
          list.appendChild(qBlock);
        });

        partCounter++;
      }

      // Part 4: Blank Matching
      if (EXAM_DATA.blankMatchingSuite) {
        const section = document.createElement('section');
        section.id = "section-matching";
        section.className = "bg-white border border-stone-200 rounded-3xl p-6 md:p-8 shadow-sm space-y-6";
        
        let optionTableHtml = '';
        EXAM_DATA.blankMatchingSuite.options.forEach((opt, idx) => {
          optionTableHtml += \`
            <div class="bg-stone-50 border border-stone-200 p-2 rounded-lg shadow-sm text-center text-xs md:text-sm font-mono font-semibold text-stone-800">
              \${opt}
            </div>
          \`;
        });

        section.innerHTML = \`
          <div class="border-l-4 border-stone-800 pl-3">
            <h2 class="text-lg font-bold text-stone-900 uppercase">Part \${romanize(partCounter)}: Blank Matching (學測文意選填)</h2>
            <p class="text-xs text-stone-500 italic mt-0.5">Directions: Match the ten candidate words below to fill in the ten gaps in the passage. Use each candidate exactly once.</p>
          </div>

          <div class="bg-stone-100 border border-stone-200 rounded-2xl p-4 md:p-5">
            <span class="text-xs uppercase tracking-wider font-mono text-stone-500 block mb-3 font-bold text-center">Candidate Option Table</span>
            <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
              \${optionTableHtml}
            </div>
          </div>

          <div class="relative bg-stone-50 border border-stone-200 rounded-2xl p-5 md:p-6 text-sm md:text-base leading-loose text-stone-900 serif-font whitespace-pre-wrap">
            <div class="absolute top-3 right-3 bg-stone-200 text-stone-800 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded">Matching Passage</div>
            \${renderMatchingPassage(EXAM_DATA.blankMatchingSuite.passage)}
          </div>

          <div class="border-t border-stone-200 pt-6">
            <h4 class="text-xs font-bold uppercase tracking-wider text-stone-400 font-mono mb-4">Compact Matching Answer Pad</h4>
            <div class="grid grid-cols-2 sm:grid-cols-5 gap-4" id="matching-answer-pad"></div>
          </div>
        \`;
        container.appendChild(section);

        // Build compact answers pad
        const pad = document.getElementById('matching-answer-pad');
        for (let i = 0; i < 10; i++) {
          const blankNum = i + 1;
          const selectBlock = document.createElement('div');
          selectBlock.className = "flex flex-col gap-1";
          
          let selectOptions = \`<option value="">Select...</option>\`;
          ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"].forEach(letter => {
            const correspondingWord = EXAM_DATA.blankMatchingSuite.options.find(o => o.startsWith(\`(\${letter})\`)) || letter;
            selectOptions += \`<option value="\${letter}">(\${letter}) \${correspondingWord.replace(\`(\${letter})\`, '').trim()}</option>\`;
          });

          selectBlock.innerHTML = \`
            <label class="text-[11px] font-bold font-mono text-stone-500">Blank (\${blankNum})</label>
            <select onchange="selectMatchingAnswer('\${i}', this.value)" id="matching-select-\${i}" class="w-full px-2 py-2 border border-stone-200 rounded-xl bg-white text-xs md:text-sm focus:outline-none focus:ring-2 focus:ring-stone-500 font-semibold">
              \${selectOptions}
            </select>
            <div id="matching-expl-\${i}" class="hidden mt-2 p-3 rounded-lg border text-xs"></div>
          \`;
          pad.appendChild(selectBlock);
        }
      }
    }

    // Replace the blanks (1) through (10) in the text with inline drop-down selectors
    function renderMatchingPassage(passageText) {
      let html = passageText;
      for (let i = 1; i <= 10; i++) {
        // Build a beautiful select dropdown for inline matching
        let selectOptions = \`<option value="">(\${i}) ?</option>\`;
        ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"].forEach(letter => {
          const correspondingWord = EXAM_DATA.blankMatchingSuite.options.find(o => o.startsWith(\`(\${letter})\`)) || letter;
          selectOptions += \`<option value="\${letter}">\${letter}</option>\`;
        });
        
        const inlineSelect = \`<select onchange="syncMatchingSelect('\${i - 1}', this.value)" id="inline-matching-select-\${i - 1}" class="inline-block mx-1.5 border border-amber-800/20 rounded bg-amber-50/50 py-0.5 px-1.5 font-bold font-mono text-xs focus:ring-2 focus:ring-amber-500 text-stone-800 transition shadow-sm">\${selectOptions}</select>\`;
        // Replace occurrences of gap like (1), (2), (3)... with the selector
        const regex = new RegExp(\`\\\\(\${i}\\\\)\`, 'g');
        html = html.replace(regex, inlineSelect);
      }
      return html;
    }

    function syncMatchingSelect(blankIdx, val) {
      document.getElementById(\`matching-select-\${blankIdx}\`).value = val;
      state.answers.matching[blankIdx] = val;
      updateNavCounters();
      updateInlineSelectStyles();
    }

    function selectMatchingAnswer(blankIdx, val) {
      document.getElementById(\`inline-matching-select-\${blankIdx}\`).value = val;
      state.answers.matching[blankIdx] = val;
      updateNavCounters();
      updateInlineSelectStyles();
    }

    function updateInlineSelectStyles() {
      for (let i = 0; i < 10; i++) {
        const inlineSel = document.getElementById(\`inline-matching-select-\${i}\`);
        if (!inlineSel) continue;
        if (inlineSel.value !== "") {
          inlineSel.classList.remove('bg-amber-50/50', 'border-amber-800/20');
          inlineSel.classList.add('bg-amber-100', 'border-amber-800', 'text-amber-950');
        } else {
          inlineSel.classList.add('bg-amber-50/50', 'border-amber-800/20');
          inlineSel.classList.remove('bg-amber-100', 'border-amber-800', 'text-amber-950');
        }
      }
    }

    // Handles single selection for Part I, II, and III multiple-choice questions
    function selectAnswer(section, questionId, letter) {
      if (state.submitted) return;
      
      // Save state
      state.answers[section][questionId] = letter;
      
      // Clear previously selected styling in this question's options
      const btns = Array.from(document.querySelectorAll(\`[id^="\${section}-btn-\${questionId}-"]\`))
        .filter(b => b.id === \`\${section}-btn-\${questionId}-A\` || 
                     b.id === \`\${section}-btn-\${questionId}-B\` || 
                     b.id === \`\${section}-btn-\${questionId}-C\` || 
                     b.id === \`\${section}-btn-\${questionId}-D\`);
      btns.forEach(b => b.classList.remove('choice-selected'));

      // Highlight the selected button
      const targetBtn = document.getElementById(\`\${section}-btn-\${questionId}-\${letter}\`);
      if (targetBtn) {
        targetBtn.classList.add('choice-selected');
      }

      updateNavCounters();
    }

    // Modal triggers
    function triggerSubmit() {
      const emptyCount = countUnanswered();
      const warningText = document.getElementById('modal-warning-text');
      
      if (emptyCount > 0) {
        warningText.innerHTML = \`<span class="text-amber-700 font-bold block mb-1">⚠️ Warning: Unanswered Questions</span> You have left <strong class="text-stone-900">\${emptyCount}</strong> questions blank. Are you sure you want to grade your paper now?\`;
      } else {
        warningText.innerHTML = "Great job answering all questions! Are you sure you want to finalize and grade your paper now?";
      }

      document.getElementById('submit-confirm-modal').classList.remove('hidden');
    }

    function countUnanswered() {
      let totalEmpty = 0;
      
      if (EXAM_DATA.vocabQuestions) {
        totalEmpty += (EXAM_DATA.vocabQuestions.length - countAnswered('vocab'));
      }
      if (EXAM_DATA.readingPassages) {
        let totalQ = 0;
        EXAM_DATA.readingPassages.forEach(p => totalQ += p.questions.length);
        totalEmpty += (totalQ - countAnswered('reading'));
      }
      if (EXAM_DATA.clozeSuite) {
        totalEmpty += (EXAM_DATA.clozeSuite.questions.length - countAnswered('cloze'));
      }
      if (EXAM_DATA.blankMatchingSuite) {
        totalEmpty += (10 - countAnswered('matching'));
      }

      return totalEmpty;
    }

    function closeSubmitModal() {
      document.getElementById('submit-confirm-modal').classList.add('hidden');
    }

    function executeSubmit() {
      closeSubmitModal();
      state.submitted = true;
      clearInterval(state.timerInterval);

      // Disable all inputs
      const btns = document.querySelectorAll('.choice-btn, select, input');
      btns.forEach(b => b.setAttribute('disabled', 'true'));

      // Grade the worksheet
      gradeWorksheet();

      // Scroll smoothly to results
      document.getElementById('results-dashboard').classList.remove('hidden');
      document.getElementById('results-dashboard').scrollIntoView({ behavior: 'smooth' });
    }

    function gradeWorksheet() {
      let correctCount = 0;
      let totalQuestions = 0;

      // Part I: Vocab Evaluation
      if (EXAM_DATA.vocabQuestions) {
        EXAM_DATA.vocabQuestions.forEach((q, qIdx) => {
          totalQuestions++;
          const userAns = state.answers.vocab[qIdx] || "";
          const isCorrect = userAns === q.correctAnswer;
          if (isCorrect) correctCount++;

          const block = document.getElementById(\`vocab-q-block-\${qIdx}\`);
          const explBlock = document.getElementById(\`vocab-expl-\${qIdx}\`);

          // Apply visual validation styles
          if (isCorrect) {
            block.classList.add('bg-green-50/50', 'border-green-300');
          } else {
            block.classList.add('bg-red-50/50', 'border-red-200');
            if (userAns) {
              const wrongBtn = document.getElementById(\`vocab-btn-\${qIdx}-\${userAns}\`);
              if (wrongBtn) wrongBtn.classList.add('bg-red-100', 'border-red-400', 'text-red-950');
            }
          }

          const correctBtn = document.getElementById(\`vocab-btn-\${qIdx}-\${q.correctAnswer}\`);
          if (correctBtn) {
            correctBtn.classList.add('bg-green-100', 'border-green-500', 'text-green-950', 'ring-2', 'ring-green-600');
          }

          explBlock.classList.remove('hidden');
          explBlock.classList.add(isCorrect ? 'bg-green-50/20' : 'bg-stone-50/80', isCorrect ? 'border-green-200/50' : 'border-stone-200');
          explBlock.innerHTML = \`
            <div class="flex items-center gap-2 mb-1 font-sans text-xs">
              \${isCorrect 
                ? '<span class="text-green-700 font-bold flex items-center gap-1">✅ 正確 Correct!</span>' 
                : \`<span class="text-red-700 font-bold flex items-center gap-1">❌ 錯誤 Incorrect • 正確答案是 (\${q.correctAnswer})</span>\`}
            </div>
            <p class="text-xs text-stone-500 font-mono">Target Vocabulary: <strong class="text-stone-800">\${q.wordTested}</strong></p>
            <p class="text-xs text-stone-700 mt-1.5 leading-relaxed font-sans"><strong class="text-stone-900">【詳解】</strong> \${q.explanation}</p>
          \`;
        });
      }

      // Part II: Reading Comp Evaluation
      if (EXAM_DATA.readingPassages) {
        EXAM_DATA.readingPassages.forEach((p, pIdx) => {
          p.questions.forEach((q, qIdx) => {
            totalQuestions++;
            const compositeKey = \`\${pIdx}_\${qIdx}\`;
            const userAns = state.answers.reading[compositeKey] || "";
            const isCorrect = userAns === q.correctAnswer;
            if (isCorrect) correctCount++;

            const block = document.getElementById(\`reading-q-block-\${compositeKey}\`);
            const explBlock = document.getElementById(\`reading-expl-\${compositeKey}\`);

            if (isCorrect) {
              block.classList.add('bg-green-50/50', 'border-green-300');
            } else {
              block.classList.add('bg-red-50/50', 'border-red-200');
              if (userAns) {
                const wrongBtn = document.getElementById(\`reading-btn-\${compositeKey}-\${userAns}\`);
                if (wrongBtn) wrongBtn.classList.add('bg-red-100', 'border-red-400', 'text-red-950');
              }
            }

            const correctBtn = document.getElementById(\`reading-btn-\${compositeKey}-\${q.correctAnswer}\`);
            if (correctBtn) {
              correctBtn.classList.add('bg-green-100', 'border-green-500', 'text-green-950', 'ring-2', 'ring-green-600');
            }

            explBlock.classList.remove('hidden');
            explBlock.classList.add(isCorrect ? 'bg-green-50/20' : 'bg-stone-50/80', isCorrect ? 'border-green-200/50' : 'border-stone-200');
            explBlock.innerHTML = \`
              <div class="flex items-center gap-2 mb-1 font-sans text-xs">
                \${isCorrect 
                  ? '<span class="text-green-700 font-bold flex items-center gap-1">✅ 正確 Correct!</span>' 
                  : \`<span class="text-red-700 font-bold flex items-center gap-1">❌ 錯誤 Incorrect • 正確答案是 (\${q.correctAnswer})</span>\`}
              </div>
              <p class="text-xs text-stone-700 mt-1.5 leading-relaxed font-sans"><strong class="text-stone-900">【詳解】</strong> \${q.explanation}</p>
            \`;
          });
        });
      }

      // Part III: Cloze Evaluation
      if (EXAM_DATA.clozeSuite) {
        EXAM_DATA.clozeSuite.questions.forEach((q, qIdx) => {
          totalQuestions++;
          const userAns = state.answers.cloze[qIdx] || "";
          const isCorrect = userAns === q.correctAnswer;
          if (isCorrect) correctCount++;

          const block = document.getElementById(\`cloze-q-block-\${qIdx}\`);
          const explBlock = document.getElementById(\`cloze-expl-\${qIdx}\`);

          if (isCorrect) {
            block.classList.add('bg-green-50/50', 'border-green-300');
          } else {
            block.classList.add('bg-red-50/50', 'border-red-200');
            if (userAns) {
              const wrongBtn = document.getElementById(\`cloze-btn-\${qIdx}-\${userAns}\`);
              if (wrongBtn) wrongBtn.classList.add('bg-red-100', 'border-red-400', 'text-red-950');
            }
          }

          const correctBtn = document.getElementById(\`cloze-btn-\${qIdx}-\${q.correctAnswer}\`);
          if (correctBtn) {
            correctBtn.classList.add('bg-green-100', 'border-green-500', 'text-green-950', 'ring-2', 'ring-green-600');
          }

          explBlock.classList.remove('hidden');
          explBlock.classList.add(isCorrect ? 'bg-green-50/20' : 'bg-stone-50/80', isCorrect ? 'border-green-200/50' : 'border-stone-200');
          explBlock.innerHTML = \`
            <div class="flex items-center gap-2 mb-1 font-sans text-xs">
              \${isCorrect 
                ? '<span class="text-green-700 font-bold flex items-center gap-1">✅ 正確 Correct!</span>' 
                : \`<span class="text-red-700 font-bold flex items-center gap-1">❌ 錯誤 Incorrect • 正確答案是 (\${q.correctAnswer})</span>\`}
            </div>
            <p class="text-xs text-stone-500 font-mono">Tested Category: <span class="uppercase font-bold text-amber-900">\${q.category}</span></p>
            <p class="text-xs text-stone-700 mt-1.5 leading-relaxed font-sans"><strong class="text-stone-900">【詳解】</strong> \${q.explanation}</p>
          \`;
        });
      }

      // Part IV: Blank Matching Evaluation
      if (EXAM_DATA.blankMatchingSuite) {
        for (let i = 0; i < 10; i++) {
          totalQuestions++;
          const userAns = state.answers.matching[i] || "";
          const correctAns = EXAM_DATA.blankMatchingSuite.answers[i];
          const isCorrect = userAns === correctAns;
          if (isCorrect) correctCount++;

          const selectEl = document.getElementById(\`matching-select-\${i}\`);
          const inlineEl = document.getElementById(\`inline-matching-select-\${i}\`);
          const explBlock = document.getElementById(\`matching-expl-\${i}\`);

          if (isCorrect) {
            selectEl.classList.add('border-green-500', 'bg-green-50', 'text-green-900');
            if (inlineEl) {
              inlineEl.classList.remove('bg-amber-100', 'border-amber-800', 'text-amber-950');
              inlineEl.classList.add('bg-green-100', 'border-green-600', 'text-green-950');
            }
          } else {
            selectEl.classList.add('border-red-400', 'bg-red-50', 'text-red-900');
            if (inlineEl) {
              inlineEl.classList.remove('bg-amber-100', 'border-amber-800', 'text-amber-950');
              inlineEl.classList.add('bg-red-100', 'border-red-500', 'text-red-950');
            }
          }

          explBlock.classList.remove('hidden');
          explBlock.className = \`mt-2 p-3 rounded-xl border text-xs leading-normal \${isCorrect ? 'bg-green-50/20 border-green-200/50 text-green-950' : 'bg-red-50/10 border-red-200/40 text-stone-700'}\`;
          explBlock.innerHTML = \`
            <div class="font-bold mb-1 font-sans text-xs">\${isCorrect ? '✅ 正確' : \`❌ 錯誤 (正解: \${correctAns})\`}</div>
            <p class="text-stone-600 font-sans"><strong class="text-stone-800">【詳解】</strong> \${EXAM_DATA.blankMatchingSuite.explanations[i]}</p>
          \`;
        }
      }

      // Compute grade percentage
      const percentage = Math.round((correctCount / totalQuestions) * 100);
      document.getElementById('score-percentage').innerText = \`\${percentage}%\`;
      document.getElementById('score-ratio').innerText = \`\${correctCount}/\${totalQuestions} Qs\`;

      // Set Shirley Du's feedback
      let feedback = "";
      if (percentage >= 90) {
        feedback = "太優秀了！你對學測核心字彙與篇章結構的掌握度已臻完美。具有極佳的語感與語法底子，繼續保持下去，大考英文必能穩拿滿級分！";
      } else if (percentage >= 75) {
        feedback = "表現非常傑出！絕大多數的題目都分析得相當精確。針對部分答錯的小細節或片語搭配多做整理與複習，突破大考頂標指日可待！";
      } else if (percentage >= 60) {
        feedback = "及格了，完成了很棒的練習進度！學測英文需要長期的字彙語感積累，請認真對照解析中的搭配詞與語意關係，下一次一定會更上層樓！";
      } else {
        feedback = "辛苦了！萬事起頭難，學測的字彙深度與長篇閱讀確實非常有挑戰性。請仔細比對答錯題目的詳解分析，將錯題與關鍵搭配詞記錄下來，Shirley 老師相信你下次必會大幅進步！";
      }
      document.getElementById('shirley-feedback').innerText = feedback;

      // Student info stamp
      const sClass = document.getElementById('student-class').value || "未註記";
      const sName = document.getElementById('student-name').value || "學生練習者";
      const sNo = document.getElementById('student-number').value || "未註記";
      const durationStr = Math.floor(state.elapsedSeconds / 60) + " 分 " + (state.elapsedSeconds % 60) + " 秒";
      
      document.getElementById('student-report-stamp').innerHTML = \`
        班級: <strong class="text-stone-200">\${sClass}</strong> \&nbsp; | \&nbsp; 
        姓名: <strong class="text-stone-200">\${sName}</strong> \&nbsp; | \&nbsp; 
        座號: <strong class="text-stone-200">\${sNo}</strong> \&nbsp; | \&nbsp; 
        答題費時: <strong class="text-stone-200">\${durationStr}</strong>
      \`;
      
      // Update sidebar counter colors
      const sideCounterList = document.querySelectorAll('[id^="nav-counter-"]');
      sideCounterList.forEach(c => {
        c.classList.remove('bg-stone-100', 'text-stone-500');
        c.classList.add('bg-amber-100', 'text-amber-900');
      });
    }

    function resetPractice() {
      if (confirm("Are you sure you want to restart the practice? This will clear all your answers and reset the stopwatch.")) {
        state.answers = { vocab: {}, reading: {}, cloze: {}, matching: {} };
        state.submitted = false;
        state.elapsedSeconds = 0;
        
        // Remove disabled attributes
        const inputs = document.querySelectorAll('.choice-btn, select, input');
        inputs.forEach(i => i.removeAttribute('disabled'));

        // Clear all select values
        const selects = document.querySelectorAll('select');
        selects.forEach(s => s.value = "");

        // Remove selections
        const btns = document.querySelectorAll('.choice-btn');
        btns.forEach(b => b.classList.remove('choice-selected', 'bg-red-100', 'border-red-400', 'text-red-950', 'bg-green-100', 'border-green-500', 'text-green-950', 'ring-2', 'ring-green-600'));

        // Reset inline select styles
        updateInlineSelectStyles();

        // Hide results
        document.getElementById('results-dashboard').classList.add('hidden');
        
        // Redraw quiz UI
        buildQuiz();
        buildNav();

        // Restart timer
        clearInterval(state.timerInterval);
        startStopwatch();

        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  </script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `GSAT_Interactive_Practice_Sheet_${Date.now()}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div id="worksheet-view" className="space-y-6">
      {/* Action panel bar - hidden during prints */}
      <div className="no-print bg-stone-100/80 backdrop-blur border border-stone-200 rounded-2xl p-4 md:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sticky top-4 z-40">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 bg-white hover:bg-stone-200 text-stone-700 hover:text-stone-900 rounded-xl transition duration-200 border border-stone-200"
            title="Back to Interactive Player"
            id="back-to-player-btn"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-bold font-display text-stone-900">Worksheet Generator Desk</h2>
            <p className="text-xs text-stone-500 font-sans mt-0.5">Prepare highly professional, printed quizzes & Traditional Chinese key lists</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
          {/* Segmented Control for Preview Mode */}
          <div className="inline-flex bg-stone-200/80 p-1 rounded-xl border border-stone-300/40">
            <button
              onClick={() => setPreviewMode("full")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition duration-200 ${
                previewMode === "full"
                  ? "bg-stone-800 text-white shadow-sm"
                  : "text-stone-600 hover:text-stone-900 hover:bg-stone-100/50"
              }`}
              id="preview-mode-full-btn"
            >
              Full Exam Sheet
            </button>
            <button
              onClick={() => setPreviewMode("questions")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition duration-200 ${
                previewMode === "questions"
                  ? "bg-stone-800 text-white shadow-sm"
                  : "text-stone-600 hover:text-stone-900 hover:bg-stone-100/50"
              }`}
              id="preview-mode-questions-btn"
            >
              Questions & Answer Sheet Only
            </button>
            <button
              onClick={() => setPreviewMode("answers")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition duration-200 ${
                previewMode === "answers"
                  ? "bg-amber-800 text-white shadow-sm"
                  : "text-stone-600 hover:text-stone-900 hover:bg-stone-100/50"
              }`}
              id="preview-mode-answers-btn"
            >
              Answers & Key Only
            </button>
          </div>

          <button
            onClick={() => {
              setIncludeExplanations(!includeExplanations);
            }}
            disabled={previewMode === "questions"}
            className={`px-4 py-2 text-xs font-medium rounded-xl flex items-center gap-1.5 border transition duration-200 ${
              previewMode === "questions"
                ? "bg-stone-100 text-stone-300 border-stone-200 cursor-not-allowed"
                : includeExplanations 
                  ? "bg-stone-800 text-white border-stone-800" 
                  : "bg-white text-stone-600 border-stone-300 hover:bg-stone-50"
            }`}
            id="toggle-explanations-btn"
          >
            <CheckSquare className="w-4 h-4" />
            {includeExplanations ? "With Explanations" : "No Explanations"}
          </button>

          <button
            onClick={handleCopy}
            className="px-4 py-2 text-xs font-medium bg-white text-stone-800 border border-stone-300 hover:bg-stone-50 rounded-xl flex items-center gap-1.5 transition duration-200"
            id="copy-markdown-btn"
          >
            <Copy className="w-4 h-4" />
            {copied ? "Copied!" : "Copy Word Markdown"}
          </button>

          <button
            onClick={handleDownloadTxt}
            className="px-4 py-2 text-xs font-medium bg-white text-stone-800 border border-stone-300 hover:bg-stone-50 rounded-xl flex items-center gap-1.5 transition duration-200"
            id="download-txt-btn"
          >
            <Download className="w-4 h-4" />
            Download .TXT
          </button>

          <button
            onClick={handleDownloadInteractiveHtml}
            className="px-4 py-2 text-xs font-medium bg-stone-900 text-stone-100 border border-stone-800 hover:bg-stone-950 rounded-xl flex items-center gap-1.5 transition duration-200 shadow-sm"
            id="download-interactive-html-btn"
            title="Download an offline, interactive HTML practice sheet for students"
          >
            <Laptop className="w-4 h-4 text-amber-400" />
            Student Local Practice (HTML)
          </button>

          <button
            onClick={handlePrint}
            className="px-4 py-2 text-xs font-medium bg-teal-800 hover:bg-teal-900 text-white rounded-xl flex items-center gap-1.5 shadow-sm transition duration-200"
            id="trigger-print-btn"
          >
            <Printer className="w-4 h-4" />
            Print Paper
          </button>
        </div>
      </div>

      {/* Actual Printable Document Container */}
      <div 
        id="printable-paper"
        className="bg-white border border-stone-200 shadow-sm p-8 md:p-12 rounded-2xl max-w-4xl mx-auto leading-relaxed text-stone-900"
        style={{ fontFamily: "'Times New Roman', Times, serif", fontSize: "14px" }}
      >
        {/* Header Block */}
        <div className="border-b-2 border-stone-800 pb-6 mb-8 text-center relative">
          <div className="text-center">
            <h1 style={{ fontSize: "20px", fontWeight: "bold" }} className="text-stone-950 uppercase tracking-tight">
              {previewMode === "answers" 
                ? "GSAT English Mock Paper - OFFICIAL ANSWER KEY & SOLUTIONS" 
                : "GSAT English Mock Paper Creator - English V/R Practice Worksheet"}
            </h1>
            <p className="text-amber-800 font-semibold text-sm mt-1">
              {previewMode === "answers" 
                ? "學測英文對照表與詳解 • Designed by Tr. Shirley Du" 
                : "學測英文模擬試卷 • Designed by Tr. Shirley Du"}
            </p>
            <p style={{ fontSize: "12px" }} className="italic text-stone-600 mt-1">GSAT Exam Preparation Suite — Traditional Chinese Detailed Solutions Included</p>
            <div className="flex justify-center items-center gap-4 text-xs font-mono text-stone-600 mt-3">
              <span>Standard: GSAT Levels 1-6</span>
            </div>
          </div>

          {previewMode !== "answers" && (
            <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4 border border-stone-300 p-3 rounded-lg text-xs bg-stone-50">
              <div>
                <span className="text-stone-500 font-semibold">Class (班級):</span> <span className="border-b border-stone-400 inline-block w-24 h-4"></span>
              </div>
              <div>
                <span className="text-stone-500 font-semibold">Name (姓名):</span> <span className="border-b border-stone-400 inline-block w-24 h-4"></span>
              </div>
              <div>
                <span className="text-stone-500 font-semibold">Date (日期):</span> <span className="border-b border-stone-400 inline-block w-24 h-4"></span>
              </div>
              <div>
                <span className="text-stone-500 font-bold text-amber-900">Score (得分):</span> <span className="border-b border-stone-400 inline-block w-16 h-4"></span>
              </div>
            </div>
          )}
        </div>

        {/* QUIZ SHEET CONTENT */}
        {previewMode !== "answers" && (
          <div className="space-y-10">
            {/* Part I: Vocab */}
            {suite.vocabQuestions && suite.vocabQuestions.length > 0 && (
              <div id="print-vocab-section" className="space-y-4">
                <div className="border-l-4 border-stone-800 pl-3">
                  <h2 style={{ fontSize: "16px", fontWeight: "bold" }} className="text-stone-900 uppercase">Part I: Multiple-Choice Questions (學測字彙單選題)</h2>
                  <p style={{ fontSize: "12px" }} className="text-stone-500 italic">Directions: Choose the best word that grammatically and contextually makes the sentence meaningful.</p>
                </div>

                <div className="space-y-4 mt-4">
                  {suite.vocabQuestions.map((q, idx) => (
                    <div key={idx} id={`print-vocab-q-${idx}`} style={{ fontSize: "12px" }} className="leading-relaxed">
                      <p className="font-medium text-stone-950">
                        <span className="font-mono font-bold mr-2 text-stone-800 inline-block print:inline">( &nbsp; &nbsp; )</span>
                        {idx + 1}. {q.question}
                      </p>
                      {/* Strictly rendered in a single horizontal line row as requested */}
                      <div className="vocab-options-row text-stone-700 italic mt-1.5 flex flex-wrap gap-x-8 gap-y-1" style={{ fontSize: "12px" }}>
                        {q.options.map((opt, optIdx) => (
                          <span key={optIdx} className="inline-block whitespace-nowrap">{opt}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Part II: Reading Passes */}
            {suite.readingPassages && suite.readingPassages.length > 0 && (
              <div id="print-reading-section" className="space-y-6">
                <div className="border-l-4 border-stone-800 pl-3">
                  <h2 style={{ fontSize: "16px", fontWeight: "bold" }} className="text-stone-900 uppercase">Part II: Reading Comprehension (學測閱讀測驗)</h2>
                  <p style={{ fontSize: "12px" }} className="text-stone-500 italic">Directions: Read each of the following passages and complete the multiple-choice comprehension questions that follow.</p>
                </div>

                {suite.readingPassages.map((p, pIdx) => (
                  <div key={pIdx} id={`print-reading-passage-${pIdx}`} className="space-y-4 border-b border-stone-200 pb-8 last:border-none">
                    <div className="bg-amber-50/50 border border-amber-900/10 rounded-lg py-1 px-3 inline-block text-[10px] font-mono uppercase tracking-wider text-amber-900 font-bold mb-1">
                      Level: {p.level}
                    </div>
                    <h3 style={{ fontSize: "14px", fontWeight: "bold" }} className="text-stone-950">
                      Passage {pIdx + 1}: {p.title}
                    </h3>
                    <p style={{ fontSize: "12px" }} className="leading-relaxed text-stone-800 whitespace-pre-wrap">
                      {p.passage}
                    </p>

                    <div className="space-y-4 mt-6">
                      {p.questions.map((q, qIdx) => (
                        <div key={qIdx} id={`print-reading-q-${pIdx}-${qIdx}`} style={{ fontSize: "12px" }}>
                          <p className="font-medium text-stone-900">
                            <span className="font-mono font-bold mr-2 text-stone-800">( &nbsp; &nbsp; )</span>
                            {qIdx + 1}. {q.question}
                          </p>
                          {/* Reading options are in separate lines as requested */}
                          <div className="flex flex-col gap-1 mt-2 pl-3 text-stone-700">
                            {q.options.map((opt, optIdx) => (
                              <span key={optIdx} className="block">{opt}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Part III: Cloze */}
            {suite.clozeSuite && (
              <div id="print-cloze-section" className="space-y-4">
                <div className="border-l-4 border-stone-800 pl-3">
                  <h2 style={{ fontSize: "16px", fontWeight: "bold" }} className="text-stone-900 uppercase">Part III: Cloze Test (學測綜合測驗)</h2>
                  <p style={{ fontSize: "12px" }} className="text-stone-500 italic">Directions: For each blank, choose the most appropriate word, conjugation, preposition, or collocation phrase.</p>
                </div>

                <h3 style={{ fontSize: "14px", fontWeight: "bold" }} className="text-stone-950 mt-4 mb-1">Cloze Passage</h3>
                <div style={{ fontSize: "12px" }} className="bg-stone-50 border border-stone-200 rounded-xl p-5 md:p-6 leading-loose text-stone-900 whitespace-pre-wrap">
                  {suite.clozeSuite.passage}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  {suite.clozeSuite.questions.map((q, idx) => (
                    <div key={idx} id={`print-cloze-q-${idx}`} style={{ fontSize: "12px" }} className="border-b border-dashed border-stone-100 pb-2">
                      <span className="font-bold text-stone-900">
                        <span className="font-mono font-bold mr-2 text-stone-800">( &nbsp; &nbsp; )</span>
                        Option ({q.gapNumber}):
                      </span>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-stone-700">
                        {q.options.map((opt, optIdx) => (
                          <span key={optIdx} className="whitespace-nowrap">{opt}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Part IV: Blank Matching */}
            {suite.blankMatchingSuite && (
              <div id="print-matching-section" className="space-y-4">
                <div className="border-l-4 border-stone-800 pl-3">
                  <h2 style={{ fontSize: "16px", fontWeight: "bold" }} className="text-stone-900 uppercase">Part IV: Blank Matching (學測文意選填)</h2>
                  <p style={{ fontSize: "12px" }} className="text-stone-500 italic">Directions: Match the ten candidate words below to fill in the ten gaps in the passage. Use each candidate exactly once.</p>
                </div>

                {/* Highly deceptive options grid */}
                <div className="bg-stone-100 border border-stone-200 rounded-xl p-4 text-center mt-4">
                  <span style={{ fontSize: "12px" }} className="uppercase tracking-wider font-mono text-stone-500 block mb-2 font-bold">Candidate Option Table</span>
                  <div className="grid grid-cols-5 gap-2 font-mono font-medium text-stone-800" style={{ fontSize: "12px" }}>
                    {suite.blankMatchingSuite.options.map((opt, idx) => (
                      <div key={idx} className="bg-white border border-stone-200 py-1.5 px-2 rounded-md shadow-sm">
                        {opt}
                      </div>
                    ))}
                  </div>
                </div>

                <h3 style={{ fontSize: "14px", fontWeight: "bold" }} className="text-stone-950 mt-4 mb-1">Matching Passage</h3>
                <div style={{ fontSize: "12px" }} className="bg-stone-55 border border-stone-200 rounded-xl p-5 md:p-6 leading-loose text-stone-900 whitespace-pre-wrap">
                  {suite.blankMatchingSuite.passage}
                </div>
              </div>
            )}
          </div>
        )}

        {/* STUDENT ANSWER SHEET (PAGE BREAK BEFORE) */}
        {previewMode !== "answers" && (
          <div className="print-page-break mt-16 pt-8 border-t-2 border-stone-800" style={{ pageBreakBefore: "always" }}>
            <div className="text-center mb-6">
              <h2 style={{ fontSize: "16px", fontWeight: "bold" }} className="uppercase tracking-widest text-stone-950">GSAT English Mock Paper - STUDENT ANSWER SHEET</h2>
              <p style={{ fontSize: "12px" }} className="text-amber-800 font-semibold italic mt-1">學測英文模擬試卷 - 學生答題卷</p>
            </div>
            
            {/* Student info fields */}
            <div className="grid grid-cols-4 gap-4 border border-stone-800 p-4 rounded-md mb-6" style={{ fontSize: "12px" }}>
              <div><strong>Class (班級):</strong> <span className="border-b border-stone-400 inline-block w-20 h-4"></span></div>
              <div><strong>Name (姓名):</strong> <span className="border-b border-stone-400 inline-block w-20 h-4"></span></div>
              <div><strong>Number (座號):</strong> <span className="border-b border-stone-400 inline-block w-16 h-4"></span></div>
              <div><strong>Score (得分):</strong> <span className="border-b border-stone-400 inline-block w-16 h-4"></span></div>
            </div>

            {/* Answer slots for each part */}
            <div className="space-y-6" style={{ fontSize: "12px" }}>
              {/* Part I: Vocab */}
              {suite.vocabQuestions && suite.vocabQuestions.length > 0 && (
                <div className="border border-stone-300 rounded-md p-4">
                  <h3 className="font-bold border-b border-stone-300 pb-1 mb-3" style={{ fontSize: "14px" }}>Part I: Vocabulary Answers (字彙單選題)</h3>
                  <div className="grid grid-cols-5 gap-y-4 gap-x-2">
                    {suite.vocabQuestions.map((_, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="font-mono font-bold w-6 text-right">{idx + 1}.</span>
                        <span className="border border-stone-400 rounded w-10 h-7 flex items-center justify-center font-bold text-stone-300">[ &nbsp; ]</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Part II: Reading Comprehension */}
              {suite.readingPassages && suite.readingPassages.length > 0 && (
                <div className="border border-stone-300 rounded-md p-4">
                  <h3 className="font-bold border-b border-stone-300 pb-1 mb-3" style={{ fontSize: "14px" }}>Part II: Reading Comprehension Answers (閱讀測驗)</h3>
                  <div className="space-y-3">
                    {suite.readingPassages.map((p, pIdx) => (
                      <div key={pIdx} className="space-y-2">
                        <div className="font-semibold text-stone-700">Passage {pIdx + 1}: {p.title}</div>
                        <div className="grid grid-cols-4 gap-2">
                          {p.questions.map((_, qIdx) => (
                            <div key={qIdx} className="flex items-center gap-2">
                              <span className="font-mono font-bold w-12">Q{qIdx + 1}:</span>
                              <span className="border border-stone-400 rounded w-10 h-7 flex items-center justify-center font-bold text-stone-300">[ &nbsp; ]</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Part III: Cloze Test */}
              {suite.clozeSuite && (
                <div className="border border-stone-300 rounded-md p-4">
                  <h3 className="font-bold border-b border-stone-300 pb-1 mb-3" style={{ fontSize: "14px" }}>Part III: Cloze Test Answers (綜合測驗)</h3>
                  <div className="grid grid-cols-5 gap-y-4 gap-x-2">
                    {suite.clozeSuite.questions.map((q, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="font-mono font-bold w-14">Gap ({q.gapNumber}).</span>
                        <span className="border border-stone-400 rounded w-10 h-7 flex items-center justify-center font-bold text-stone-300">[ &nbsp; ]</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Part IV: Blank Matching */}
              {suite.blankMatchingSuite && (
                <div className="border border-stone-300 rounded-md p-4">
                  <h3 className="font-bold border-b border-stone-300 pb-1 mb-3" style={{ fontSize: "14px" }}>Part IV: Blank Matching Answers (文意選填)</h3>
                  <div className="grid grid-cols-5 gap-y-4 gap-x-2">
                    {suite.blankMatchingSuite.answers.map((_, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="font-mono font-bold w-12">Blank ({idx + 1}).</span>
                        <span className="border border-stone-400 rounded w-10 h-7 flex items-center justify-center font-bold text-stone-300">[ &nbsp; ]</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PRINTABLE ANSWER KEY & SOLUTIONS SECTION */}
        {previewMode !== "questions" && (
          <div className="print-page-break mt-16 pt-8 border-t-2 border-double border-stone-800" style={previewMode === "full" ? { pageBreakBefore: "always" } : undefined}>
          <div className="text-center mb-6">
            <h2 style={{ fontSize: "16px", fontWeight: "bold" }} className="uppercase tracking-widest text-stone-950">Official Answer Key Chart</h2>
            <p className="text-xs text-amber-900 italic font-serif">學測英語備考對照表 — 官方快速閱卷簡明答案卡</p>
          </div>

          {/* OFFICIAL ANSWER KEY CHART (compact grid) */}
          <div className="border border-stone-800 rounded-md p-4 bg-stone-50 mb-8" style={{ fontSize: "12px" }}>
            <div className="space-y-6">
              {/* Part I Answers (Vocab) */}
              {suite.vocabQuestions && suite.vocabQuestions.length > 0 && (
                <div>
                  <div className="font-bold text-stone-800 mb-2">Part I: Vocabulary Answers (字彙單選題答案)</div>
                  <table className="w-full text-center border-collapse border border-stone-300">
                    <thead>
                      <tr className="bg-stone-200">
                        <th className="border border-stone-300 py-1 font-semibold">Question</th>
                        {suite.vocabQuestions.map((_, idx) => (
                          <th key={idx} className="border border-stone-300 py-1 font-mono">{idx + 1}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-stone-300 font-bold py-1.5 bg-stone-100">Answer</td>
                        {suite.vocabQuestions.map((q, idx) => (
                          <td key={idx} className="border border-stone-300 font-bold font-mono text-amber-900 py-1.5">{q.correctAnswer}</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* Part II Answers (Reading) */}
              {suite.readingPassages && suite.readingPassages.length > 0 && (
                <div>
                  <div className="font-bold text-stone-800 mb-2">Part II: Reading Comprehension Answers (閱讀測驗答案)</div>
                  <table className="w-full text-center border-collapse border border-stone-300">
                    <thead>
                      <tr className="bg-stone-200">
                        <th className="border border-stone-300 py-1 font-semibold">Passage</th>
                        <th className="border border-stone-300 py-1 font-semibold" colSpan={4}>Questions & Correct Answers</th>
                      </tr>
                    </thead>
                    <tbody>
                      {suite.readingPassages.map((p, pIdx) => (
                        <tr key={pIdx}>
                          <td className="border border-stone-300 font-bold py-1.5 bg-stone-100">Passage {pIdx + 1}</td>
                          {p.questions.map((q, qIdx) => (
                            <td key={qIdx} className="border border-stone-300 py-1.5 font-mono">
                              <span className="text-stone-500 mr-1">Q{qIdx + 1}:</span>
                              <strong className="text-amber-900">{q.correctAnswer}</strong>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Part III Answers (Cloze) */}
              {suite.clozeSuite && (
                <div>
                  <div className="font-bold text-stone-800 mb-2">Part III: Cloze Test Answers (綜合測驗答案)</div>
                  <table className="w-full text-center border-collapse border border-stone-300">
                    <thead>
                      <tr className="bg-stone-200">
                        <th className="border border-stone-300 py-1 font-semibold">Gap Number</th>
                        {suite.clozeSuite.questions.map((q, idx) => (
                          <th key={idx} className="border border-stone-300 py-1 font-mono">({q.gapNumber})</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-stone-300 font-bold py-1.5 bg-stone-100">Answer</td>
                        {suite.clozeSuite.questions.map((q, idx) => (
                          <td key={idx} className="border border-stone-300 font-bold font-mono text-amber-900 py-1.5">{q.correctAnswer}</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* Part IV Answers (Blank Matching) */}
              {suite.blankMatchingSuite && (
                <div>
                  <div className="font-bold text-stone-800 mb-2">Part IV: Blank Matching Answers (文意選填答案)</div>
                  <table className="w-full text-center border-collapse border border-stone-300">
                    <thead>
                      <tr className="bg-stone-200">
                        <th className="border border-stone-300 py-1 font-semibold">Blank Number</th>
                        {suite.blankMatchingSuite.answers.map((_, idx) => (
                          <th key={idx} className="border border-stone-300 py-1 font-mono">({idx + 1})</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-stone-300 font-bold py-1.5 bg-stone-100">Answer</td>
                        {suite.blankMatchingSuite.answers.map((ans, idx) => (
                          <td key={idx} className="border border-stone-300 font-bold font-mono text-amber-900 py-1.5">{ans}</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* DETAILED EXPLANATIONS SECTION (printed below the chart) */}
          {includeExplanations && (
            <div className="space-y-8 mt-10 pt-8 border-t border-dashed border-stone-300">
              <div className="text-center mb-6">
                <h3 style={{ fontSize: "14px", fontWeight: "bold" }} className="uppercase text-stone-900">Detailed Explanations & Translations (題型解析與翻譯)</h3>
              </div>

              <div className="space-y-8 text-xs leading-relaxed text-stone-800">
                {/* Part I solutions */}
                {suite.vocabQuestions && suite.vocabQuestions.length > 0 && (
                  <div id="solutions-vocab" className="space-y-3">
                    <h4 style={{ fontSize: "12px", fontWeight: "bold" }} className="border-b border-stone-300 pb-1 text-stone-900 uppercase">Part I: Vocabulary Solutions</h4>
                    <div className="grid grid-cols-1 gap-4">
                      {suite.vocabQuestions.map((q, idx) => (
                        <div key={idx} className="bg-stone-50/80 p-3 rounded-lg border border-stone-200">
                          <div className="flex justify-between font-mono font-bold text-amber-900 mb-1">
                            <span>Question {idx + 1}</span>
                            <span>Correct: ({q.correctAnswer})</span>
                          </div>
                          <p className="text-stone-500 font-mono">Target Word: <strong>{q.wordTested}</strong></p>
                          <p className="text-stone-700 mt-1.5 leading-normal">
                            <span className="font-sans font-bold">【詳解】</span> {q.explanation}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Part II solutions */}
                {suite.readingPassages && suite.readingPassages.length > 0 && (
                  <div id="solutions-reading" className="space-y-3 pt-4 border-t border-dashed border-stone-200">
                    <h4 style={{ fontSize: "12px", fontWeight: "bold" }} className="border-b border-stone-300 pb-1 text-stone-900 uppercase">Part II: Reading Comprehension Solutions</h4>
                    <div className="space-y-6">
                      {suite.readingPassages.map((p, pIdx) => (
                        <div key={pIdx} className="space-y-3">
                          <span className="inline-block bg-amber-100 text-amber-900 font-mono text-[10px] px-2 py-0.5 rounded font-bold uppercase">
                            Passage {pIdx + 1}: {p.title}
                          </span>
                          <div className="grid grid-cols-1 gap-4">
                            {p.questions.map((q, qIdx) => (
                              <div key={qIdx} className="bg-stone-50/80 p-3 rounded-lg border border-stone-200">
                                <div className="flex justify-between font-mono font-bold text-amber-900 mb-1">
                                  <span>Q {qIdx + 1}</span>
                                  <span>Correct: ({q.correctAnswer})</span>
                                </div>
                                <p className="font-medium text-stone-700 my-1 italic">{q.question}</p>
                                <p className="text-stone-700 mt-1.5 leading-normal">
                                  <span className="font-sans font-bold">【詳解】</span> {q.explanation}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Part III solutions */}
                {suite.clozeSuite && (
                  <div id="solutions-cloze" className="space-y-3 pt-4 border-t border-dashed border-stone-200">
                    <h4 style={{ fontSize: "12px", fontWeight: "bold" }} className="border-b border-stone-300 pb-1 text-stone-900 uppercase">Part III: Cloze Solutions</h4>
                    <div className="grid grid-cols-1 gap-4">
                      {suite.clozeSuite.questions.map((q, idx) => (
                        <div key={idx} className="bg-stone-50/80 p-3 rounded-lg border border-stone-200">
                          <div className="flex justify-between font-mono font-bold text-amber-900 mb-1">
                            <span>Blank ({q.gapNumber})</span>
                            <span>Correct: ({q.correctAnswer})</span>
                          </div>
                          <p className="text-stone-500 font-mono">Category: <span className="uppercase">{q.category}</span></p>
                          <p className="text-stone-700 mt-1.5 leading-normal">
                            <span className="font-sans font-bold">【詳解】</span> {q.explanation}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Part IV solutions */}
                {suite.blankMatchingSuite && (
                  <div id="solutions-matching" className="space-y-3 pt-4 border-t border-dashed border-stone-200">
                    <h4 style={{ fontSize: "12px", fontWeight: "bold" }} className="border-b border-stone-300 pb-1 text-stone-900 uppercase">Part IV: Blank Matching Solutions</h4>
                    <div className="space-y-2">
                      {suite.blankMatchingSuite.explanations.map((expl, idx) => (
                        <div key={idx} className="bg-stone-50/80 p-3 rounded-lg border border-stone-200">
                          <div className="font-mono font-bold text-amber-900 mb-1">
                            Blank ({idx + 1}) — Correct: [{suite.blankMatchingSuite!.answers[idx]}]
                          </div>
                          <p className="text-stone-700 leading-normal">
                            <span className="font-sans font-bold">【詳解】</span> {expl}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          </div>
        )}

        {/* Footer info for printed papers */}
        <div className="border-t border-stone-300 pt-4 mt-12 flex justify-between text-[10px] font-mono text-stone-500">
          <span>Printed on GSAT English Mock Paper Creator</span>
          <span>Designed by Tr. Shirley Du</span>
          <span>Page 1 of 1</span>
        </div>
      </div>
    </div>
  );
}

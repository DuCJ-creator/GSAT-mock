/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Copy, Printer, FileText, CheckSquare, Eye, ArrowLeft, Download, FileSpreadsheet } from "lucide-react";
import { GeneratedExamSuite } from "../types";

interface WorksheetExportProps {
  suite: GeneratedExamSuite;
  onBack: () => void;
}

export default function WorksheetExport({ suite, onBack }: WorksheetExportProps) {
  const [includeExplanations, setIncludeExplanations] = useState(true);
  const [showOnlyAnswers, setShowOnlyAnswers] = useState(false);
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
          <button
            onClick={() => {
              setIncludeExplanations(!includeExplanations);
              setShowOnlyAnswers(false);
            }}
            className={`px-4 py-2 text-xs font-medium rounded-xl flex items-center gap-1.5 border transition duration-200 ${
              includeExplanations 
                ? "bg-stone-800 text-white border-stone-800" 
                : "bg-white text-stone-600 border-stone-300 hover:bg-stone-50"
            }`}
            id="toggle-explanations-btn"
          >
            <CheckSquare className="w-4 h-4" />
            {includeExplanations ? "With Explanations" : "No Explanations"}
          </button>

          <button
            onClick={() => {
              setShowOnlyAnswers(!showOnlyAnswers);
            }}
            className={`px-4 py-2 text-xs font-medium rounded-xl flex items-center gap-1.5 border transition duration-200 ${
              showOnlyAnswers 
                ? "bg-amber-800 text-white border-amber-800"
                : "bg-white text-stone-600 border-stone-300 hover:bg-stone-50"
            }`}
            id="toggle-answers-only-btn"
          >
            <Eye className="w-4 h-4" />
            {showOnlyAnswers ? "Answers Only Preview" : "Full Exam Sheet"}
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
        style={{ fontFamily: "'Times New Roman', Times, serif" }}
      >
        {/* Header Block */}
        <div className="border-b-2 border-stone-800 pb-6 mb-8 text-center relative">
          <div className="text-center">
            <h1 style={{ fontSize: "20px", fontWeight: "bold" }} className="text-stone-950 uppercase tracking-tight">
              GSAT English Mock Paper Creator - English V/R Practice Worksheet
            </h1>
            <p className="text-amber-800 font-semibold text-sm mt-1">學測英文模擬試卷 • Designed by Tr. Shirley Du</p>
            <p style={{ fontSize: "12px" }} className="italic text-stone-600 mt-1">GSAT Exam Preparation Suite — Traditional Chinese Detailed Solutions Included</p>
            <div className="flex justify-center items-center gap-4 text-xs font-mono text-stone-600 mt-3">
              <span>Standard: GSAT Levels 1-6</span>
            </div>
          </div>

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
        </div>

        {/* QUIZ SHEET CONTENT */}
        {!showOnlyAnswers && (
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
        {!showOnlyAnswers && (
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
        <div className="print-page-break mt-16 pt-8 border-t-2 border-double border-stone-800" style={{ pageBreakBefore: "always" }}>
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

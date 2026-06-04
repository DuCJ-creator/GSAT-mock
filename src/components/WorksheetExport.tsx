/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { normalizeOptions } from "../utils/helpers";
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

  const generateMarkdown = () => {
    let md = `# GSAT English Mock Paper Creator - English Practice Worksheet\n`;
    md += `## Designed by Tr. Shirley Du (學測英文模擬試卷）\n\n`;
    md += `Class: ______________  Name: ______________  Date: ______________  Score: ______________\n`;
    md += `========================================================================\n\n`;

    // Vocab
    if (suite.vocabQuestions && suite.vocabQuestions.length > 0) {
      md += `### Part I: Multiple-Choice Questions (10 GSAT-Level Questions)\n`;
      md += `*Directions: Choose the best word to fill in each blank and complete the sentence.*\n\n`;
      suite.vocabQuestions.forEach((q, idx) => {
        md += `${idx + 1}. ${q.question}\n`;
        md += `   ${normalizeOptions(q.options).join("   ")}\n\n`;
      });
      md += `\n`;
    }

    // Cloze
    if (suite.clozeSuite && suite.clozeSuite.questions) {
      md += `### Part II: Cloze Test (綜合測驗)\n`;
      md += `*Directions: Read the passage and choose the best option for each blank (gaps 11–15).*\n\n`;
      md += `${suite.clozeSuite.passage}\n\n`;
      suite.clozeSuite.questions.forEach((q) => {
        md += `(${q.gapNumber}) ${normalizeOptions(q.options).join("   ")}\n`;
      });
      md += `\n\n`;
    }

    // Matching
    if (suite.blankMatchingSuite) {
      md += `### Part III: Blank Matching (文意選填)\n`;
      md += `*Directions: Choose the correct word from the options below to fill in each blank (gaps 16–25). Use each option exactly once.*\n\n`;
      md += `Options:\n`;
      md += `   ${normalizeOptions(suite.blankMatchingSuite.options).join("   ")}\n\n`;
      md += `${suite.blankMatchingSuite.passage}\n\n`;
    }

    // Reading
    if (suite.readingPassages && suite.readingPassages.length > 0) {
      md += `### Part IV: Reading Comprehension\n`;
      md += `*Directions: Read the following passages and choose the best answer for each question.*\n\n`;
      suite.readingPassages.forEach((p, pIdx) => {
        md += `[Passage ${pIdx + 1}] Level: ${p.level.toUpperCase()} - ${p.title}\n`;
        md += `${p.passage}\n\n`;
        p.questions.forEach((q, qIdx) => {
          md += `  ${qIdx + 1}. ${q.question}\n`;
          normalizeOptions(q.options).forEach((opt) => {
            md += `     ${opt}\n`;
          });
          md += `\n`;
        });
        md += `\n`;
      });
    }

    md += `\n\n========================================================================\n`;
    md += `### ANSWER KEY & EXPLANATIONS (解答與詳解)\n`;
    md += `========================================================================\n\n`;

    if (suite.vocabQuestions && suite.vocabQuestions.length > 0) {
      md += `#### Part I Solution:\n`;
      suite.vocabQuestions.forEach((q, idx) => {
        md += `${idx + 1}. Correct Answer: (${q.correctAnswer}) - Word Tested: ${q.wordTested}\n`;
        if (includeExplanations) md += `   解析: ${q.explanation}\n\n`;
      });
      md += `\n`;
    }

    if (suite.clozeSuite && suite.clozeSuite.questions) {
      md += `#### Part II Solution:\n`;
      suite.clozeSuite.questions.forEach((q) => {
        md += `Gap (${q.gapNumber}) Correct Answer: (${q.correctAnswer}) [Category: ${q.category}]\n`;
        if (includeExplanations) md += `   解析: ${q.explanation}\n\n`;
      });
      md += `\n`;
    }

    if (suite.blankMatchingSuite) {
      md += `#### Part III Solution:\n`;
      md += `Blanks (16) through (25) Answers:\n`;
      suite.blankMatchingSuite.answers.forEach((ans, idx) => {
        md += `(${idx + 16}): ${ans}  (Word: ${normalizeOptions(suite.blankMatchingSuite!.options).find(o => o.startsWith(`(${ans})`)) || ans})\n`;
        if (includeExplanations) md += `     解析: ${suite.blankMatchingSuite!.explanations[idx]}\n`;
      });
      md += `\n`;
    }

    if (suite.readingPassages && suite.readingPassages.length > 0) {
      md += `#### Part IV Solution:\n`;
      suite.readingPassages.forEach((p, pIdx) => {
        md += `[Passage ${pIdx + 1}] - ${p.title}\n`;
        p.questions.forEach((q, qIdx) => {
          md += `  Question ${qIdx + 1}: Correct Answer: (${q.correctAnswer})\n`;
          if (includeExplanations) md += `     解析: ${q.explanation}\n\n`;
        });
        md += `\n`;
      });
    }

    return md;
  };

  const handleCopy = () => {
    const text = generateMarkdown();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => window.print();

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
      {/* Action panel bar */}
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
            onClick={() => { setIncludeExplanations(!includeExplanations); setShowOnlyAnswers(false); }}
            className={`px-4 py-2 text-xs font-medium rounded-xl flex items-center gap-1.5 border transition duration-200 ${includeExplanations ? "bg-stone-800 text-white border-stone-800" : "bg-white text-stone-600 border-stone-300 hover:bg-stone-50"}`}
            id="toggle-explanations-btn"
          >
            <CheckSquare className="w-4 h-4" />
            {includeExplanations ? "With Explanations" : "No Explanations"}
          </button>

          <button
            onClick={() => setShowOnlyAnswers(!showOnlyAnswers)}
            className={`px-4 py-2 text-xs font-medium rounded-xl flex items-center gap-1.5 border transition duration-200 ${showOnlyAnswers ? "bg-amber-800 text-white border-amber-800" : "bg-white text-stone-600 border-stone-300 hover:bg-stone-50"}`}
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

      {/* Printable Document */}
      <div
        id="printable-paper"
        className="bg-white border border-stone-200 shadow-sm p-8 md:p-12 rounded-2xl max-w-4xl mx-auto font-sans leading-relaxed text-stone-900"
      >
        {/* Header */}
        <div className="border-b-2 border-stone-800 pb-6 mb-8 text-center relative">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-stone-950 uppercase tracking-tight">GSAT English Mock Paper</h1>
            <p className="text-amber-800 font-semibold text-base mt-1">學測英文模擬試卷 • Designed by Tr. Shirley Du</p>
            <p className="text-xs italic text-stone-600 mt-1">GSAT Exam Preparation Suite — Traditional Chinese Detailed Solutions Included</p>
            <div className="flex justify-center items-center gap-4 text-xs font-mono text-stone-600 mt-3">
              <span>Standard: GSAT Levels 1-6</span>
            </div>
          </div>
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4 border border-stone-300 p-3 rounded-lg text-xs font-serif bg-stone-50">
            <div><span className="text-stone-500">Class (班級):</span> <span className="border-b border-stone-400 inline-block w-24 h-4"></span></div>
            <div><span className="text-stone-500">Name (姓名):</span> <span className="border-b border-stone-400 inline-block w-24 h-4"></span></div>
            <div><span className="text-stone-500">Date (日期):</span> <span className="border-b border-stone-400 inline-block w-24 h-4"></span></div>
            <div><span className="text-stone-500 font-bold text-amber-900">Score (學分/得分):</span> <span className="border-b border-stone-400 inline-block w-16 h-4"></span></div>
          </div>
        </div>

        {/* Quiz Sheet */}
        {!showOnlyAnswers && (
          <div className="space-y-10">

            {/* Part I: Vocab */}
            {suite.vocabQuestions && suite.vocabQuestions.length > 0 && (
              <div id="print-vocab-section" className="space-y-4">
                <div className="border-l-4 border-stone-800 pl-3">
                  <h2 className="text-lg font-bold font-display text-stone-900 uppercase">Part I: Multiple-Choice Questions (學測字彙單選題)</h2>
                  <p className="text-xs text-stone-500 italic">Directions: Choose the best word that grammatically and contextually makes the sentence meaningful.</p>
                </div>
                <div className="space-y-6 mt-4">
                  {suite.vocabQuestions.map((q, idx) => {
                    const questionText = q.question || q.prompt || q.sentence || q.stem || "";
                    return (
                      <div key={idx} id={`print-vocab-q-${idx}`} className="text-sm leading-relaxed">
                        <p className="font-medium text-stone-950">{idx + 1}. {questionText || <span className="text-rose-400 italic">⚠ Question text missing</span>}</p>
                        <div className="vocab-options-row text-stone-700 italic mt-1.5 flex flex-wrap gap-x-8 gap-y-1 text-xs">
                          {normalizeOptions(q.options).map((opt, optIdx) => (
                            <span key={optIdx} className="inline-block whitespace-nowrap">{opt}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Part II: Cloze */}
            {suite.clozeSuite && suite.clozeSuite.questions && (
              <div id="print-cloze-section" className="space-y-4 print-page-break">
                <div className="border-l-4 border-stone-800 pl-3">
                  <h2 className="text-lg font-bold font-display text-stone-900 uppercase">Part II: Cloze Test (學測綜合測驗)</h2>
                  <p className="text-xs text-stone-500 italic">Directions: For each blank (gaps 11–15), choose the most appropriate option.</p>
                </div>
                <div className="bg-stone-50 border border-stone-200 rounded-xl p-5 md:p-6 text-sm font-sans leading-loose text-stone-900 mt-4 whitespace-pre-wrap">
                  {suite.clozeSuite.passage}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  {suite.clozeSuite.questions.map((q, idx) => {
                    const gapNum = q.gapNumber ?? (11 + idx);
                    return (
                      <div key={idx} id={`print-cloze-q-${idx}`} className="text-xs border-b border-dashed border-stone-100 pb-2">
                        <span className="font-bold text-stone-900">({gapNum})</span>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-stone-700">
                          {normalizeOptions(q.options).map((opt, optIdx) => (
                            <span key={optIdx} className="whitespace-nowrap">{opt}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Part III: Blank Matching */}
            {suite.blankMatchingSuite && (
              <div id="print-matching-section" className="space-y-4 print-page-break">
                <div className="border-l-4 border-stone-800 pl-3">
                  <h2 className="text-lg font-bold font-display text-stone-900 uppercase">Part III: Blank Matching (學測文意選填)</h2>
                  <p className="text-xs text-stone-500 italic">Directions: Match the ten candidate words below to fill in gaps 16–25. Use each candidate exactly once.</p>
                </div>
                <div className="bg-stone-100 border border-stone-200 rounded-xl p-4 text-center mt-4">
                  <span className="text-xs uppercase tracking-wider font-mono text-stone-500 block mb-2 font-bold">Candidate Option Table</span>
                  <div className="grid grid-cols-5 gap-2 text-xs font-mono font-medium text-stone-800">
                    {normalizeOptions(suite.blankMatchingSuite.options).map((opt, idx) => (
                      <div key={idx} className="bg-white border border-stone-200 py-1.5 px-2 rounded-md shadow-sm">{opt}</div>
                    ))}
                  </div>
                </div>
                <div className="bg-stone-50 border border-stone-200 rounded-xl p-5 md:p-6 text-sm font-sans leading-loose text-stone-900 mt-4 whitespace-pre-wrap">
                  {suite.blankMatchingSuite.passage}
                </div>
              </div>
            )}

            {/* Part IV: Reading */}
            {suite.readingPassages && suite.readingPassages.length > 0 && (
              <div id="print-reading-section" className="space-y-6 print-page-break">
                <div className="border-l-4 border-stone-800 pl-3">
                  <h2 className="text-lg font-bold font-display text-stone-900 uppercase">Part IV: Reading Comprehension (學測閱讀測驗)</h2>
                  <p className="text-xs text-stone-500 italic">Directions: Read each passage and answer the four comprehension questions that follow.</p>
                </div>
                {suite.readingPassages.map((p, pIdx) => (
                  <div key={pIdx} id={`print-reading-passage-${pIdx}`} className="space-y-4 border-b border-stone-200 pb-8 last:border-none">
                    <div className="bg-amber-50/50 border border-amber-900/10 rounded-lg py-1 px-3 inline-block text-[10px] font-mono uppercase tracking-wider text-amber-900 font-bold mb-1">
                      Level: {p.level}
                    </div>
                    <h3 className="text-base font-bold font-serif text-stone-950">{p.title}</h3>
                    <p className="text-sm leading-relaxed text-stone-800 whitespace-pre-wrap font-serif">{p.passage}</p>
                    <div className="space-y-4 mt-6">
                      {p.questions.map((q, qIdx) => (
                        <div key={qIdx} id={`print-reading-q-${pIdx}-${qIdx}`} className="text-sm">
                          <p className="font-medium text-stone-900">{qIdx + 1}. {q.question}</p>
                          <div className="flex flex-col gap-1 mt-2 pl-3 text-stone-700 text-xs">
                            {normalizeOptions(q.options).map((opt, optIdx) => (
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
          </div>
        )}

        {/* Answer Key */}
        <div className="print-page-break mt-12 pt-8 border-t-2 border-double border-stone-800">
          <div className="text-center mb-8">
            <h2 className="text-xl font-extrabold font-display uppercase tracking-widest text-stone-950">Answer Key & Detailed Explanations</h2>
            <p className="text-xs text-amber-900 italic font-serif">學測英語備考吃到飽 — 解答與 Traditional Chinese 專業詳解</p>
          </div>

          <div className="space-y-8 text-xs leading-relaxed text-stone-800">

            {/* Part I answers */}
            {suite.vocabQuestions && suite.vocabQuestions.length > 0 && (
              <div id="solutions-vocab" className="space-y-3">
                <h3 className="text-sm font-bold border-b border-stone-300 pb-1 text-stone-900">Part I: Vocabulary Answer Sheet</h3>
                <div className="grid grid-cols-2 gap-4">
                  {suite.vocabQuestions.map((q, idx) => (
                    <div key={idx} className="bg-stone-50/80 p-2.5 rounded-lg border border-stone-200">
                      <div className="flex justify-between font-mono font-bold text-amber-900">
                        <span>Question {idx + 1}</span>
                        <span>Answer: ({q.correctAnswer})</span>
                      </div>
                      <p className="text-stone-500 font-mono mt-0.5">Target: <strong>{q.wordTested}</strong></p>
                      {includeExplanations && (
                        <p className="text-stone-700 mt-1.5 leading-normal">
                          <span className="font-sans font-bold">【詳解】</span> {q.explanation}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Part II answers */}
            {suite.clozeSuite && suite.clozeSuite.questions && (
              <div id="solutions-cloze" className="space-y-3 pt-4 border-t border-dashed border-stone-200">
                <h3 className="text-sm font-bold border-b border-stone-300 pb-1 text-stone-900">Part II: Cloze Solution</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {suite.clozeSuite.questions.map((q, idx) => (
                    <div key={idx} className="bg-stone-50/80 p-2.5 rounded-lg border border-stone-200">
                      <div className="flex justify-between font-mono font-bold text-amber-900">
                        <span>Blank ({q.gapNumber})</span>
                        <span>Answer: ({q.correctAnswer})</span>
                      </div>
                      <span className="inline-block bg-stone-200/60 text-[10px] font-mono px-1.5 py-0.5 rounded text-stone-600 mt-1 uppercase">
                        Category: {q.category}
                      </span>
                      {includeExplanations && (
                        <p className="text-stone-700 mt-1.5 leading-normal">
                          <span className="font-sans font-bold">【詳解】</span> {q.explanation}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Part III answers */}
            {suite.blankMatchingSuite && (
              <div id="solutions-matching" className="space-y-3 pt-4 border-t border-dashed border-stone-200">
                <h3 className="text-sm font-bold border-b border-stone-300 pb-1 text-stone-900">Part III: Blank Matching Key</h3>
                <div className="bg-stone-50 rounded-xl p-4 border border-stone-200 grid grid-cols-2 sm:grid-cols-5 gap-3 font-mono font-bold text-stone-800 mb-3 text-center">
                  {suite.blankMatchingSuite.answers.map((ans, idx) => (
                    <div key={idx} className="bg-white border border-stone-300 py-1 rounded-md">
                      Gap ({idx + 16}): {ans}
                    </div>
                  ))}
                </div>
                {includeExplanations && (
                  <div className="space-y-2 pl-2">
                    {suite.blankMatchingSuite.explanations.map((expl, idx) => (
                      <p key={idx} className="text-stone-700">
                        <strong>({idx + 16}) [{suite.blankMatchingSuite!.answers[idx]}]:</strong> {expl}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Part IV answers */}
            {suite.readingPassages && suite.readingPassages.length > 0 && (
              <div id="solutions-reading" className="space-y-3 pt-4 border-t border-dashed border-stone-200">
                <h3 className="text-sm font-bold border-b border-stone-300 pb-1 text-stone-900">Part IV: Reading Solutions</h3>
                <div className="space-y-6">
                  {suite.readingPassages.map((p, pIdx) => (
                    <div key={pIdx} className="space-y-2">
                      <span className="inline-block bg-amber-100 text-amber-900 font-mono text-[10px] px-2 py-0.5 rounded font-bold uppercase">
                        Passage {pIdx + 1}: {p.title} ({p.level})
                      </span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {p.questions.map((q, qIdx) => (
                          <div key={qIdx} className="bg-stone-50/80 p-2.5 rounded-lg border border-stone-200">
                            <div className="flex justify-between font-mono font-bold text-amber-900">
                              <span>Q {qIdx + 1}</span>
                              <span>Answer: ({q.correctAnswer})</span>
                            </div>
                            <p className="font-medium text-stone-700 my-1 italic">{q.question}</p>
                            {includeExplanations && (
                              <p className="text-stone-700 mt-1 leading-normal">
                                <span className="font-sans font-bold">【詳解】</span> {q.explanation}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-stone-300 pt-4 mt-12 flex justify-between text-[10px] font-mono text-stone-500">
          <span>Printed on GSAT English Mock Paper Creator</span>
          <span>Designed by Tr. Shirley Du</span>
          <span>Page 1 of 1</span>
        </div>
      </div>
    </div>
  );
}

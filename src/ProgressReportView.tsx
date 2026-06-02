/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import { Award, BookOpen, Clock, AlertTriangle, CheckCircle, RefreshCw, Printer, FileText, Sparkles, Smile, Star, ArrowRight } from "lucide-react";
import { ProgressReport, GeneratedExamSuite } from "../types";

interface ProgressReportProps {
  report: ProgressReport;
  suite: GeneratedExamSuite;
  onRestart: () => void;
  onGoToWorksheet: () => void;
}

interface TeacherFeedback {
  greeting: string;
  analysis: string;
  tips: string[];
  encouragement: string;
}

export default function ProgressReportView({ report, suite, onRestart, onGoToWorksheet }: ProgressReportProps) {
  const [feedback, setFeedback] = useState<TeacherFeedback | null>(null);
  const [loadingFeedback, setLoadingFeedback] = useState(true);
  const [errorFeedback, setErrorFeedback] = useState<string | null>(null);

  useEffect(() => {
    // Request dynamic teacher diagnostics from our full-stack Express API
    async function fetchTeacherDiagnostics() {
      try {
        setLoadingFeedback(true);
        const response = await fetch("/api/evaluate-report", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scoreSummary: report.scoreSummary,
            details: report.details,
            selectedLevel: suite.metadata.selectedLevel,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to generate dynamic diagnostics.");
        }

        const resData = await response.json();
        if (resData.success) {
          setFeedback(resData.data);
        } else {
          throw new Error(resData.error || "Failed feedback fetch");
        }
      } catch (err: any) {
        console.error("Feedback Generation Error:", err);
        setErrorFeedback(
          "無法載入專屬講評。別擔心！你依然可以閱讀底下的每題詳解與檢討。加油！"
        );
      } finally {
        setLoadingFeedback(false);
      }
    }

    fetchTeacherDiagnostics();
  }, [report, suite]);

  // Format milliseconds to mm:ss
  const formatDuration = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}m ${secs}s`;
  };

  const getAccuracyColor = (score: number) => {
    if (score >= 80) return "text-teal-700 bg-teal-50 border-teal-100";
    if (score >= 60) return "text-amber-700 bg-amber-50 border-amber-100";
    return "text-red-700 bg-red-50 border-red-100";
  };

  const getScoreMessage = (score: number) => {
    if (score >= 90) return "學霸降臨！無懈可擊！";
    if (score >= 80) return "頂標實力！再接再厲！";
    if (score >= 60) return "均標通過！掌握魔鬼細節！";
    return "尚有努力空間！多複習必考搭配詞。";
  };

  return (
    <div className="space-y-8" id="progress-report-view">
      {/* Top Banner Message */}
      <div className="bg-gradient-to-r from-teal-900 to-amber-950 text-white rounded-3xl p-6 md:p-8 shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-2">
          <span className="bg-white/15 px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider text-amber-200">
            Exam Completed (備考任務完成)
          </span>
          <h1 className="text-2xl md:text-3xl font-bold font-display leading-tight">
            學測英語備考：成果診斷報告書
          </h1>
          <p className="text-stone-300 text-sm font-sans">
            系統即時答題診斷
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onGoToWorksheet}
            className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 hover:border-white/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition duration-200"
            id="report-to-worksheet-btn"
          >
            <Printer className="w-4 h-4" />
            Print/Export PDF
          </button>
          <button
            onClick={onRestart}
            className="px-4 py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition duration-200"
            id="report-re-practice-btn"
          >
            <RefreshCw className="w-4 h-4" />
            Practice Again
          </button>
        </div>
      </div>

      {/* Main Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Total Score Ring */}
        <div className="bg-white border border-stone-200 p-6 rounded-2xl flex flex-col items-center justify-center text-center shadow-xs">
          <span className="text-xs font-bold font-mono uppercase text-stone-500 mb-3">Overall Accuracy</span>
          <div className="relative w-28 h-28 flex items-center justify-center">
            {/* SVG circle meter */}
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="56"
                cy="56"
                r="44"
                stroke="#E7E5E4"
                strokeWidth="8"
                fill="transparent"
              />
              <circle
                cx="56"
                cy="56"
                r="44"
                stroke={report.scoreSummary.comprehensive.score >= 60 ? "#0f766e" : "#b91c1c"}
                strokeWidth="8"
                fill="transparent"
                strokeDasharray={276}
                strokeDashoffset={276 - (276 * report.scoreSummary.comprehensive.score) / 100}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-2xl font-extrabold font-mono text-stone-900">
                {report.scoreSummary.comprehensive.score}%
              </span>
              <span className="text-[10px] text-stone-500 font-medium">
                {report.scoreSummary.comprehensive.correct}/{report.scoreSummary.comprehensive.total} Correct
              </span>
            </div>
          </div>
          <span className="mt-4 text-xs font-bold text-teal-800 font-display">
            {getScoreMessage(report.scoreSummary.comprehensive.score)}
          </span>
        </div>

        {/* Diagnostic Metrics Cards */}
        <div className="bg-white border border-stone-200 p-5 rounded-2xl flex flex-col justify-between shadow-xs">
          <div className="flex items-start justify-between">
            <span className="text-xs font-bold font-mono uppercase text-stone-500">Duration Spent</span>
            <span className="p-1.5 bg-amber-50 rounded-lg text-amber-800">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-extrabold font-mono text-stone-900">
              {formatDuration(report.durationMs)}
            </h3>
            <p className="text-xs text-stone-500 mt-1 font-sans">
              Total session active timer
            </p>
          </div>
        </div>

        <div className="bg-white border border-stone-200 p-5 rounded-2xl flex flex-col justify-between shadow-xs">
          <div className="flex items-start justify-between">
            <span className="text-xs font-bold font-mono uppercase text-stone-500">Syllabus Range</span>
            <span className="p-1.5 bg-teal-50 rounded-lg text-teal-800">
              <BookOpen className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-extrabold font-mono text-stone-900">
              Level {suite.metadata.selectedLevel}
            </h3>
            <p className="text-xs text-stone-500 mt-1 font-sans">
              {suite.metadata.vocabCount} dynamic reference vocabulary
            </p>
          </div>
        </div>

        <div className="bg-white border border-stone-200 p-5 rounded-2xl flex flex-col justify-between shadow-xs">
          <div className="flex items-start justify-between">
            <span className="text-xs font-bold font-mono uppercase text-stone-500">Status Marker</span>
            <span className="p-1.5 bg-stone-50 rounded-lg text-stone-600">
              <Award className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-4">
            <h3 className="text-xl font-extrabold font-display text-stone-900">
              Completed!
            </h3>
            <p className="text-xs text-stone-500 mt-1 font-sans">
              Interactive session submitted
            </p>
          </div>
        </div>
      </div>

      {/* Section-by-Section Accuracy Bar Charts */}
      <div className="bg-white border border-stone-200 p-6 md:p-8 rounded-2xl shadow-xs space-y-5">
        <h2 className="text-md font-bold font-display text-stone-900 flex items-center gap-2">
          <Award className="w-5 h-5 text-amber-800" />
          Section Score Breakdown (各題型答對率)
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { label: "Part I: Multiple-Choice (字彙題)", ...report.scoreSummary.vocab },
            { label: "Part II: Cloze (綜合測驗)", ...report.scoreSummary.cloze },
            { label: "Part III: Match (文意選填)", ...report.scoreSummary.blankMatching },
            { label: "Part IV: Reading (閱讀測驗)", ...report.scoreSummary.reading },
          ].map((sec, idx) => {
            if (sec.total === 0) return null; // Hide if not generated
            return (
              <div key={idx} className="space-y-1.5 p-3 rounded-xl hover:bg-stone-50/50 transition">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-stone-800">{sec.label}</span>
                  <span className="font-mono font-bold text-stone-900">
                    {sec.correct}/{sec.total} ({sec.score}%)
                  </span>
                </div>
                {/* Horizontal Progress Bar */}
                <div className="h-2.5 bg-stone-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${
                      sec.score >= 80 ? "bg-teal-700" : sec.score >= 60 ? "bg-amber-700" : "bg-rose-700"
                    }`}
                    style={{ width: `${sec.score}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tr. Shirley Du's AI Expert Feedback Panel */}
      <div className="bg-amber-50/50 border border-amber-900/10 rounded-3xl p-6 md:p-8 shadow-xs relative overflow-hidden">
        {/* Aesthetic design accents */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-900/5 rounded-full blur-2xl -mr-10 -mt-10"></div>
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-teal-900/5 rounded-full blur-xl -ml-8 -mb-8"></div>

        <div className="relative space-y-4">
          <div className="flex items-center gap-2 text-amber-800">
            <Sparkles className="w-5 h-5" />
            <h2 className="font-bold font-display text-lg tracking-wide uppercase">考生專屬備考叮嚀</h2>
          </div>

          {loadingFeedback ? (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-2">
              <RefreshCw className="w-6 h-6 text-amber-800 animate-spin" />
              <p className="text-xs text-stone-500 font-sans">
                正在批閱你的答題成果，並撰寫診斷建議與必考補帖中，請稍候...
              </p>
            </div>
          ) : errorFeedback ? (
            <div className="bg-white/80 p-4 rounded-xl border border-amber-900/10 text-stone-600 text-xs text-center">
              {errorFeedback}
            </div>
          ) : feedback ? (
            <div id="teacher-feedback-content" className="space-y-6">
              {/* Teacher's personal greeting */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-amber-800 rounded-full flex items-center justify-center text-white shrink-0 font-bold shadow-sm select-none">
                  Tr
                </div>
                <div className="space-y-1.5">
                  <h4 className="text-sm font-bold text-amber-950 font-display flex items-center gap-1.5">
                    {feedback.greeting}
                    <Smile className="w-4 h-4 text-amber-700" />
                  </h4>
                  <p className="text-stone-750 text-xs leading-relaxed whitespace-pre-wrap font-sans">
                    {feedback.analysis}
                  </p>
                </div>
              </div>

              {/* Study advice and specific tricks */}
              <div className="border-t border-amber-900/5 pt-4">
                <h5 className="text-xs font-bold text-stone-800 mb-3 uppercase tracking-wider font-display flex items-center gap-1.5">
                  <Star className="w-4 h-4 text-amber-700" />
                  學測大補丸 & 備考建議
                </h5>
                <ul className="space-y-3 pl-1">
                  {feedback.tips.map((tip, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-xs">
                      <span className="w-5 h-5 bg-teal-800 text-white rounded-full flex items-center justify-center font-mono font-bold text-[10px] shrink-0 mt-0.5 shadow-xs">
                        {idx + 1}
                      </span>
                      <p className="text-stone-700 leading-normal font-sans">
                        {tip}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Final Motivational Quote */}
              <div className="bg-white border border-amber-900/10 p-4 rounded-xl text-center shadow-xs italic font-editorial text-amber-950 text-sm">
                "{feedback.encouragement}"
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Comprehensive Audit & Explanations Panel */}
      <div className="space-y-4">
        <div className="border-l-4 border-stone-800 pl-3">
          <h2 className="text-md font-bold font-display text-stone-900 uppercase">Interactive Review & Analysis (錯題檢討與分析)</h2>
          <p className="text-xs text-stone-500 font-sans">請閱讀底下的每題詳解與考點分析。</p>
        </div>

        <div className="space-y-4">
          {report.details.map((item, idx) => (
            <div
              key={idx}
              className={`bg-white border border-stone-200 rounded-xl p-5 shadow-xs transition duration-200 flex flex-col md:flex-row gap-4 justify-between items-start ${
                item.isCorrect ? "hover:border-teal-200" : "border-rose-150 hover:border-rose-200"
              }`}
              id={`review-item-${idx}`}
            >
              <div className="space-y-2 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="bg-stone-100 text-stone-600 px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-bold">
                    {item.section === "vocab" 
                      ? "Vocab MC" 
                      : item.section === "cloze" 
                        ? "Cloze" 
                        : item.section === "blankMatching" 
                          ? "Blank Match" 
                          : "Reading"}
                  </span>
                  
                  {item.isCorrect ? (
                    <span className="text-teal-700 bg-teal-50 border border-teal-100 flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold">
                      <CheckCircle className="w-3.5 h-3.5" /> 正確 Correct
                    </span>
                  ) : (
                    <span className="text-rose-700 bg-rose-50 border border-rose-100 flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold">
                      <AlertTriangle className="w-3.5 h-3.5" /> 錯誤 Incorrect
                    </span>
                  )}
                </div>

                <p className="text-xs font-semibold text-stone-900 leading-relaxed">
                  {item.questionNumberOrName}. {item.questionText || "Passage Blank Option"}
                </p>

                <div className="flex flex-wrap items-center gap-3 text-xs mt-1">
                  <p className="text-stone-500 font-sans">
                    Your choice: <strong className={item.isCorrect ? "text-teal-700 font-bold" : "text-rose-700 font-bold font-mono"}>({item.userAnswer || "None"})</strong>
                  </p>
                  <p className="text-stone-500 font-sans">
                    Correct Answer: <strong className="text-teal-700 font-mono font-bold">({item.correctAnswer})</strong>
                  </p>
                </div>
              </div>

              {/* Find explanations corresponding from the suite */}
              <div className="w-full md:w-80 border-t md:border-t-0 md:border-l border-stone-100 pt-3 md:pt-0 md:pl-4">
                <span className="text-[10px] uppercase font-mono tracking-wider text-stone-400 block font-bold mb-1">Teacher's Note (學測解析)</span>
                <p className="text-stone-700 text-xs leading-normal font-sans">
                  {item.section === "vocab" && suite.vocabQuestions
                    ? suite.vocabQuestions.find(q => q.id === item.questionNumberOrName)?.explanation || "無獨立解析"
                    : item.section === "cloze" && suite.clozeSuite
                      ? suite.clozeSuite.questions.find(q => String(q.gapNumber) === item.questionNumberOrName)?.explanation || "無獨立解析"
                      : item.section === "blankMatching" && suite.blankMatchingSuite
                        ? suite.blankMatchingSuite.explanations[parseInt(item.questionNumberOrName) - 1] || "無獨立解析"
                        : item.section === "reading" && suite.readingPassages
                          ? suite.readingPassages.flatMap(p => p.questions).find(q => q.id === item.questionNumberOrName)?.explanation || "無獨立解析"
                          : "載入解析失敗"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Centered Actions */}
      <div className="flex justify-center items-center gap-4 py-6 border-t border-stone-200">
        <button
          onClick={onRestart}
          className="px-6 py-3 bg-stone-900 hover:bg-stone-850 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition duration-200"
          id="report-re-practice-bottom-btn"
        >
          <RefreshCw className="w-4 h-4" />
          Test New Words (自主單字/主題)
        </button>
        <button
          onClick={onGoToWorksheet}
          className="px-6 py-3 bg-teal-800 hover:bg-teal-900 text-white rounded-xl text-sm font-semibold flex items-center gap-2 shadow-sm transition duration-200"
          id="report-to-worksheet-bottom-btn"
        >
          <FileText className="w-4 h-4" />
          Print Paper (列印學測本)
        </button>
      </div>
    </div>
  );
}

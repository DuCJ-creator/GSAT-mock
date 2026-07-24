/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Copy, Printer, CheckSquare, ArrowLeft, Download, Laptop } from "lucide-react";
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

    md += `

========================================================================
`;
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
    // A deliberately low-profile, still-editable payload. This is not encryption:
    // it only avoids exposing obvious field names such as `correctAnswer`.
    const packEditableSuite = (value: unknown, parentKey = ""): unknown => {
      if (Array.isArray(value)) {
        return value.map((item) => packEditableSuite(item, parentKey));
      }

      if (value && typeof value === "object") {
        const source = value as Record<string, unknown>;
        const packed: Record<string, unknown> = {};
        const aliases: Record<string, string> = {
          vocabQuestions: "v",
          readingPassages: "r",
          question: "q",
          options: "o",
          correctAnswer: "k",
          wordTested: "w",
          answerText: "t",
          explanation: "x",
          title: "h",
          passage: "p",
          questions: "s",
          level: "l"
        };

        Object.entries(source).forEach(([key, child]) => {
          const outputKey = aliases[key] || key;
          if (key === "correctAnswer" && typeof child === "string") {
            const index = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"].indexOf(child.toUpperCase());
            packed[outputKey] = index >= 0 ? index + 1 : child;
          } else {
            packed[outputKey] = packEditableSuite(child, key);
          }
        });
        return packed;
      }

      return value;
    };

    // Keep the payload human-editable, but make it safe inside an HTML data block.
    // Escaping every HTML-significant character prevents any question or
    // explanation from accidentally terminating the block.
    const serializedData = JSON.stringify(suite, null, 2)
      .replace(/&/g, "\\u0026")
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
    
    const htmlContent = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GSAT English Mock Practice - Student Interactive Platform</title>
  <!-- Tailwind utilities are embedded so the downloaded HTML works offline and on GitHub Pages. -->
  <style>
/*! tailwindcss v4.1.10 | MIT License | https://tailwindcss.com */
@layer properties;
@layer theme, base, components, utilities;
@layer theme {
  :root, :host {
    --font-sans: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji",
      "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
    --font-serif: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
    --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
      "Courier New", monospace;
    --color-red-50: oklch(97.1% 0.013 17.38);
    --color-red-100: oklch(93.6% 0.032 17.717);
    --color-red-200: oklch(88.5% 0.062 18.334);
    --color-red-400: oklch(70.4% 0.191 22.216);
    --color-red-950: oklch(25.8% 0.092 26.042);
    --color-amber-50: oklch(98.7% 0.022 95.277);
    --color-amber-100: oklch(96.2% 0.059 95.617);
    --color-amber-400: oklch(82.8% 0.189 84.429);
    --color-amber-500: oklch(76.9% 0.188 70.08);
    --color-amber-800: oklch(47.3% 0.137 46.201);
    --color-amber-900: oklch(41.4% 0.112 45.904);
    --color-amber-950: oklch(27.9% 0.077 45.635);
    --color-green-50: oklch(98.2% 0.018 155.826);
    --color-green-100: oklch(96.2% 0.044 156.743);
    --color-green-200: oklch(92.5% 0.084 155.995);
    --color-green-300: oklch(87.1% 0.15 154.449);
    --color-green-500: oklch(72.3% 0.219 149.579);
    --color-green-600: oklch(62.7% 0.194 149.214);
    --color-green-950: oklch(26.6% 0.065 152.934);
    --color-teal-800: oklch(43.7% 0.078 188.216);
    --color-teal-900: oklch(38.6% 0.063 188.416);
    --color-stone-50: oklch(98.5% 0.001 106.423);
    --color-stone-100: oklch(97% 0.001 106.424);
    --color-stone-200: oklch(92.3% 0.003 48.717);
    --color-stone-300: oklch(86.9% 0.005 56.366);
    --color-stone-400: oklch(70.9% 0.01 56.259);
    --color-stone-500: oklch(55.3% 0.013 58.071);
    --color-stone-600: oklch(44.4% 0.011 73.639);
    --color-stone-700: oklch(37.4% 0.01 67.558);
    --color-stone-800: oklch(26.8% 0.007 34.298);
    --color-stone-900: oklch(21.6% 0.006 56.043);
    --color-stone-950: oklch(14.7% 0.004 49.25);
    --color-white: #fff;
    --spacing: 0.25rem;
    --container-md: 28rem;
    --container-4xl: 56rem;
    --container-7xl: 80rem;
    --text-xs: 0.75rem;
    --text-xs--line-height: calc(1 / 0.75);
    --text-sm: 0.875rem;
    --text-sm--line-height: calc(1.25 / 0.875);
    --text-base: 1rem;
    --text-base--line-height: calc(1.5 / 1);
    --text-lg: 1.125rem;
    --text-lg--line-height: calc(1.75 / 1.125);
    --text-xl: 1.25rem;
    --text-xl--line-height: calc(1.75 / 1.25);
    --text-2xl: 1.5rem;
    --text-2xl--line-height: calc(2 / 1.5);
    --font-weight-medium: 500;
    --font-weight-semibold: 600;
    --font-weight-bold: 700;
    --font-weight-extrabold: 800;
    --tracking-tight: -0.025em;
    --tracking-wide: 0.025em;
    --tracking-wider: 0.05em;
    --tracking-widest: 0.1em;
    --leading-normal: 1.5;
    --leading-relaxed: 1.625;
    --radius-md: 0.375rem;
    --radius-lg: 0.5rem;
    --radius-xl: 0.75rem;
    --radius-2xl: 1rem;
    --radius-3xl: 1.5rem;
    --animate-pulse: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    --blur-sm: 8px;
    --default-transition-duration: 150ms;
    --default-transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    --default-font-family: var(--font-sans);
    --default-mono-font-family: var(--font-mono);
  }
}
@layer base {
  *, ::after, ::before, ::backdrop, ::file-selector-button {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    border: 0 solid;
  }
  html, :host {
    line-height: 1.5;
    -webkit-text-size-adjust: 100%;
    tab-size: 4;
    font-family: var(--default-font-family, ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji");
    font-feature-settings: var(--default-font-feature-settings, normal);
    font-variation-settings: var(--default-font-variation-settings, normal);
    -webkit-tap-highlight-color: transparent;
  }
  hr {
    height: 0;
    color: inherit;
    border-top-width: 1px;
  }
  abbr:where([title]) {
    -webkit-text-decoration: underline dotted;
    text-decoration: underline dotted;
  }
  h1, h2, h3, h4, h5, h6 {
    font-size: inherit;
    font-weight: inherit;
  }
  a {
    color: inherit;
    -webkit-text-decoration: inherit;
    text-decoration: inherit;
  }
  b, strong {
    font-weight: bolder;
  }
  code, kbd, samp, pre {
    font-family: var(--default-mono-font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace);
    font-feature-settings: var(--default-mono-font-feature-settings, normal);
    font-variation-settings: var(--default-mono-font-variation-settings, normal);
    font-size: 1em;
  }
  small {
    font-size: 80%;
  }
  sub, sup {
    font-size: 75%;
    line-height: 0;
    position: relative;
    vertical-align: baseline;
  }
  sub {
    bottom: -0.25em;
  }
  sup {
    top: -0.5em;
  }
  table {
    text-indent: 0;
    border-color: inherit;
    border-collapse: collapse;
  }
  :-moz-focusring {
    outline: auto;
  }
  progress {
    vertical-align: baseline;
  }
  summary {
    display: list-item;
  }
  ol, ul, menu {
    list-style: none;
  }
  img, svg, video, canvas, audio, iframe, embed, object {
    display: block;
    vertical-align: middle;
  }
  img, video {
    max-width: 100%;
    height: auto;
  }
  button, input, select, optgroup, textarea, ::file-selector-button {
    font: inherit;
    font-feature-settings: inherit;
    font-variation-settings: inherit;
    letter-spacing: inherit;
    color: inherit;
    border-radius: 0;
    background-color: transparent;
    opacity: 1;
  }
  :where(select:is([multiple], [size])) optgroup {
    font-weight: bolder;
  }
  :where(select:is([multiple], [size])) optgroup option {
    padding-inline-start: 20px;
  }
  ::file-selector-button {
    margin-inline-end: 4px;
  }
  ::placeholder {
    opacity: 1;
  }
  @supports (not (-webkit-appearance: -apple-pay-button))  or (contain-intrinsic-size: 1px) {
    ::placeholder {
      color: currentcolor;
      @supports (color: color-mix(in lab, red, red)) {
        color: color-mix(in oklab, currentcolor 50%, transparent);
      }
    }
  }
  textarea {
    resize: vertical;
  }
  ::-webkit-search-decoration {
    -webkit-appearance: none;
  }
  ::-webkit-date-and-time-value {
    min-height: 1lh;
    text-align: inherit;
  }
  ::-webkit-datetime-edit {
    display: inline-flex;
  }
  ::-webkit-datetime-edit-fields-wrapper {
    padding: 0;
  }
  ::-webkit-datetime-edit, ::-webkit-datetime-edit-year-field, ::-webkit-datetime-edit-month-field, ::-webkit-datetime-edit-day-field, ::-webkit-datetime-edit-hour-field, ::-webkit-datetime-edit-minute-field, ::-webkit-datetime-edit-second-field, ::-webkit-datetime-edit-millisecond-field, ::-webkit-datetime-edit-meridiem-field {
    padding-block: 0;
  }
  :-moz-ui-invalid {
    box-shadow: none;
  }
  button, input:where([type="button"], [type="reset"], [type="submit"]), ::file-selector-button {
    appearance: button;
  }
  ::-webkit-inner-spin-button, ::-webkit-outer-spin-button {
    height: auto;
  }
  [hidden]:where(:not([hidden="until-found"])) {
    display: none !important;
  }
}
@layer utilities {
  .fixed {
    position: fixed;
  }
  .relative {
    position: relative;
  }
  .sticky {
    position: sticky;
  }
  .inset-0 {
    inset: calc(var(--spacing) * 0);
  }
  .top-4 {
    top: calc(var(--spacing) * 4);
  }
  .z-40 {
    z-index: 40;
  }
  .z-50 {
    z-index: 50;
  }
  .mx-auto {
    margin-inline: auto;
  }
  .my-1 {
    margin-block: calc(var(--spacing) * 1);
  }
  .mt-0\.5 {
    margin-top: calc(var(--spacing) * 0.5);
  }
  .mt-1 {
    margin-top: calc(var(--spacing) * 1);
  }
  .mt-1\.5 {
    margin-top: calc(var(--spacing) * 1.5);
  }
  .mt-2 {
    margin-top: calc(var(--spacing) * 2);
  }
  .mt-3 {
    margin-top: calc(var(--spacing) * 3);
  }
  .mt-4 {
    margin-top: calc(var(--spacing) * 4);
  }
  .mt-6 {
    margin-top: calc(var(--spacing) * 6);
  }
  .mt-8 {
    margin-top: calc(var(--spacing) * 8);
  }
  .mt-10 {
    margin-top: calc(var(--spacing) * 10);
  }
  .mt-12 {
    margin-top: calc(var(--spacing) * 12);
  }
  .mt-16 {
    margin-top: calc(var(--spacing) * 16);
  }
  .mr-1 {
    margin-right: calc(var(--spacing) * 1);
  }
  .mr-2 {
    margin-right: calc(var(--spacing) * 2);
  }
  .mb-1 {
    margin-bottom: calc(var(--spacing) * 1);
  }
  .mb-2 {
    margin-bottom: calc(var(--spacing) * 2);
  }
  .mb-3 {
    margin-bottom: calc(var(--spacing) * 3);
  }
  .mb-4 {
    margin-bottom: calc(var(--spacing) * 4);
  }
  .mb-6 {
    margin-bottom: calc(var(--spacing) * 6);
  }
  .mb-8 {
    margin-bottom: calc(var(--spacing) * 8);
  }
  .block {
    display: block;
  }
  .flex {
    display: flex;
  }
  .grid {
    display: grid;
  }
  .hidden {
    display: none;
  }
  .inline-block {
    display: inline-block;
  }
  .inline-flex {
    display: inline-flex;
  }
  .h-4 {
    height: calc(var(--spacing) * 4);
  }
  .h-5 {
    height: calc(var(--spacing) * 5);
  }
  .h-6 {
    height: calc(var(--spacing) * 6);
  }
  .h-7 {
    height: calc(var(--spacing) * 7);
  }
  .h-24 {
    height: calc(var(--spacing) * 24);
  }
  .min-h-screen {
    min-height: 100vh;
  }
  .w-4 {
    width: calc(var(--spacing) * 4);
  }
  .w-5 {
    width: calc(var(--spacing) * 5);
  }
  .w-6 {
    width: calc(var(--spacing) * 6);
  }
  .w-10 {
    width: calc(var(--spacing) * 10);
  }
  .w-12 {
    width: calc(var(--spacing) * 12);
  }
  .w-16 {
    width: calc(var(--spacing) * 16);
  }
  .w-20 {
    width: calc(var(--spacing) * 20);
  }
  .w-24 {
    width: calc(var(--spacing) * 24);
  }
  .w-full {
    width: 100%;
  }
  .max-w-4xl {
    max-width: var(--container-4xl);
  }
  .max-w-7xl {
    max-width: var(--container-7xl);
  }
  .max-w-md {
    max-width: var(--container-md);
  }
  .border-collapse {
    border-collapse: collapse;
  }
  .animate-pulse {
    animation: var(--animate-pulse);
  }
  .cursor-not-allowed {
    cursor: not-allowed;
  }
  .grid-cols-1 {
    grid-template-columns: repeat(1, minmax(0, 1fr));
  }
  .grid-cols-2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .grid-cols-4 {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
  .grid-cols-5 {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
  .flex-col {
    flex-direction: column;
  }
  .flex-wrap {
    flex-wrap: wrap;
  }
  .items-center {
    align-items: center;
  }
  .items-start {
    align-items: flex-start;
  }
  .justify-between {
    justify-content: space-between;
  }
  .justify-center {
    justify-content: center;
  }
  .justify-end {
    justify-content: flex-end;
  }
  .gap-1 {
    gap: calc(var(--spacing) * 1);
  }
  .gap-1\.5 {
    gap: calc(var(--spacing) * 1.5);
  }
  .gap-2 {
    gap: calc(var(--spacing) * 2);
  }
  .gap-3 {
    gap: calc(var(--spacing) * 3);
  }
  .gap-4 {
    gap: calc(var(--spacing) * 4);
  }
  .gap-6 {
    gap: calc(var(--spacing) * 6);
  }
  .gap-8 {
    gap: calc(var(--spacing) * 8);
  }
  .space-y-1\.5 {
    :where(& > :not(:last-child)) {
      --tw-space-y-reverse: 0;
      margin-block-start: calc(calc(var(--spacing) * 1.5) * var(--tw-space-y-reverse));
      margin-block-end: calc(calc(var(--spacing) * 1.5) * calc(1 - var(--tw-space-y-reverse)));
    }
  }
  .space-y-2 {
    :where(& > :not(:last-child)) {
      --tw-space-y-reverse: 0;
      margin-block-start: calc(calc(var(--spacing) * 2) * var(--tw-space-y-reverse));
      margin-block-end: calc(calc(var(--spacing) * 2) * calc(1 - var(--tw-space-y-reverse)));
    }
  }
  .space-y-3 {
    :where(& > :not(:last-child)) {
      --tw-space-y-reverse: 0;
      margin-block-start: calc(calc(var(--spacing) * 3) * var(--tw-space-y-reverse));
      margin-block-end: calc(calc(var(--spacing) * 3) * calc(1 - var(--tw-space-y-reverse)));
    }
  }
  .space-y-4 {
    :where(& > :not(:last-child)) {
      --tw-space-y-reverse: 0;
      margin-block-start: calc(calc(var(--spacing) * 4) * var(--tw-space-y-reverse));
      margin-block-end: calc(calc(var(--spacing) * 4) * calc(1 - var(--tw-space-y-reverse)));
    }
  }
  .space-y-6 {
    :where(& > :not(:last-child)) {
      --tw-space-y-reverse: 0;
      margin-block-start: calc(calc(var(--spacing) * 6) * var(--tw-space-y-reverse));
      margin-block-end: calc(calc(var(--spacing) * 6) * calc(1 - var(--tw-space-y-reverse)));
    }
  }
  .space-y-8 {
    :where(& > :not(:last-child)) {
      --tw-space-y-reverse: 0;
      margin-block-start: calc(calc(var(--spacing) * 8) * var(--tw-space-y-reverse));
      margin-block-end: calc(calc(var(--spacing) * 8) * calc(1 - var(--tw-space-y-reverse)));
    }
  }
  .space-y-10 {
    :where(& > :not(:last-child)) {
      --tw-space-y-reverse: 0;
      margin-block-start: calc(calc(var(--spacing) * 10) * var(--tw-space-y-reverse));
      margin-block-end: calc(calc(var(--spacing) * 10) * calc(1 - var(--tw-space-y-reverse)));
    }
  }
  .space-y-12 {
    :where(& > :not(:last-child)) {
      --tw-space-y-reverse: 0;
      margin-block-start: calc(calc(var(--spacing) * 12) * var(--tw-space-y-reverse));
      margin-block-end: calc(calc(var(--spacing) * 12) * calc(1 - var(--tw-space-y-reverse)));
    }
  }
  .gap-x-2 {
    column-gap: calc(var(--spacing) * 2);
  }
  .gap-x-8 {
    column-gap: calc(var(--spacing) * 8);
  }
  .gap-y-1 {
    row-gap: calc(var(--spacing) * 1);
  }
  .gap-y-4 {
    row-gap: calc(var(--spacing) * 4);
  }
  .rounded {
    border-radius: 0.25rem;
  }
  .rounded-2xl {
    border-radius: var(--radius-2xl);
  }
  .rounded-3xl {
    border-radius: var(--radius-3xl);
  }
  .rounded-full {
    border-radius: calc(infinity * 1px);
  }
  .rounded-lg {
    border-radius: var(--radius-lg);
  }
  .rounded-md {
    border-radius: var(--radius-md);
  }
  .rounded-xl {
    border-radius: var(--radius-xl);
  }
  .border {
    border-style: var(--tw-border-style);
    border-width: 1px;
  }
  .border-4 {
    border-style: var(--tw-border-style);
    border-width: 4px;
  }
  .border-t {
    border-top-style: var(--tw-border-style);
    border-top-width: 1px;
  }
  .border-t-2 {
    border-top-style: var(--tw-border-style);
    border-top-width: 2px;
  }
  .border-b {
    border-bottom-style: var(--tw-border-style);
    border-bottom-width: 1px;
  }
  .border-b-2 {
    border-bottom-style: var(--tw-border-style);
    border-bottom-width: 2px;
  }
  .border-l-4 {
    border-left-style: var(--tw-border-style);
    border-left-width: 4px;
  }
  .border-dashed {
    --tw-border-style: dashed;
    border-style: dashed;
  }
  .border-double {
    --tw-border-style: double;
    border-style: double;
  }
  .border-amber-800 {
    border-color: var(--color-amber-800);
  }
  .border-amber-800\/20 {
    border-color: color-mix(in srgb, oklch(47.3% 0.137 46.201) 20%, transparent);
    @supports (color: color-mix(in lab, red, red)) {
      border-color: color-mix(in oklab, var(--color-amber-800) 20%, transparent);
    }
  }
  .border-amber-900\/10 {
    border-color: color-mix(in srgb, oklch(41.4% 0.112 45.904) 10%, transparent);
    @supports (color: color-mix(in lab, red, red)) {
      border-color: color-mix(in oklab, var(--color-amber-900) 10%, transparent);
    }
  }
  .border-green-200\/50 {
    border-color: color-mix(in srgb, oklch(92.5% 0.084 155.995) 50%, transparent);
    @supports (color: color-mix(in lab, red, red)) {
      border-color: color-mix(in oklab, var(--color-green-200) 50%, transparent);
    }
  }
  .border-green-300 {
    border-color: var(--color-green-300);
  }
  .border-green-500 {
    border-color: var(--color-green-500);
  }
  .border-red-200 {
    border-color: var(--color-red-200);
  }
  .border-red-400 {
    border-color: var(--color-red-400);
  }
  .border-stone-100 {
    border-color: var(--color-stone-100);
  }
  .border-stone-200 {
    border-color: var(--color-stone-200);
  }
  .border-stone-300 {
    border-color: var(--color-stone-300);
  }
  .border-stone-300\/40 {
    border-color: color-mix(in srgb, oklch(86.9% 0.005 56.366) 40%, transparent);
    @supports (color: color-mix(in lab, red, red)) {
      border-color: color-mix(in oklab, var(--color-stone-300) 40%, transparent);
    }
  }
  .border-stone-400 {
    border-color: var(--color-stone-400);
  }
  .border-stone-800 {
    border-color: var(--color-stone-800);
  }
  .border-transparent {
    border-color: transparent;
  }
  .bg-amber-50\/20 {
    background-color: color-mix(in srgb, oklch(98.7% 0.022 95.277) 20%, transparent);
    @supports (color: color-mix(in lab, red, red)) {
      background-color: color-mix(in oklab, var(--color-amber-50) 20%, transparent);
    }
  }
  .bg-amber-50\/50 {
    background-color: color-mix(in srgb, oklch(98.7% 0.022 95.277) 50%, transparent);
    @supports (color: color-mix(in lab, red, red)) {
      background-color: color-mix(in oklab, var(--color-amber-50) 50%, transparent);
    }
  }
  .bg-amber-100 {
    background-color: var(--color-amber-100);
  }
  .bg-amber-500 {
    background-color: var(--color-amber-500);
  }
  .bg-amber-500\/10 {
    background-color: color-mix(in srgb, oklch(76.9% 0.188 70.08) 10%, transparent);
    @supports (color: color-mix(in lab, red, red)) {
      background-color: color-mix(in oklab, var(--color-amber-500) 10%, transparent);
    }
  }
  .bg-amber-800 {
    background-color: var(--color-amber-800);
  }
  .bg-green-50\/20 {
    background-color: color-mix(in srgb, oklch(98.2% 0.018 155.826) 20%, transparent);
    @supports (color: color-mix(in lab, red, red)) {
      background-color: color-mix(in oklab, var(--color-green-50) 20%, transparent);
    }
  }
  .bg-green-50\/50 {
    background-color: color-mix(in srgb, oklch(98.2% 0.018 155.826) 50%, transparent);
    @supports (color: color-mix(in lab, red, red)) {
      background-color: color-mix(in oklab, var(--color-green-50) 50%, transparent);
    }
  }
  .bg-green-100 {
    background-color: var(--color-green-100);
  }
  .bg-red-50\/50 {
    background-color: color-mix(in srgb, oklch(97.1% 0.013 17.38) 50%, transparent);
    @supports (color: color-mix(in lab, red, red)) {
      background-color: color-mix(in oklab, var(--color-red-50) 50%, transparent);
    }
  }
  .bg-red-100 {
    background-color: var(--color-red-100);
  }
  .bg-stone-50 {
    background-color: var(--color-stone-50);
  }
  .bg-stone-50\/50 {
    background-color: color-mix(in srgb, oklch(98.5% 0.001 106.423) 50%, transparent);
    @supports (color: color-mix(in lab, red, red)) {
      background-color: color-mix(in oklab, var(--color-stone-50) 50%, transparent);
    }
  }
  .bg-stone-50\/80 {
    background-color: color-mix(in srgb, oklch(98.5% 0.001 106.423) 80%, transparent);
    @supports (color: color-mix(in lab, red, red)) {
      background-color: color-mix(in oklab, var(--color-stone-50) 80%, transparent);
    }
  }
  .bg-stone-100 {
    background-color: var(--color-stone-100);
  }
  .bg-stone-100\/80 {
    background-color: color-mix(in srgb, oklch(97% 0.001 106.424) 80%, transparent);
    @supports (color: color-mix(in lab, red, red)) {
      background-color: color-mix(in oklab, var(--color-stone-100) 80%, transparent);
    }
  }
  .bg-stone-200 {
    background-color: var(--color-stone-200);
  }
  .bg-stone-200\/80 {
    background-color: color-mix(in srgb, oklch(92.3% 0.003 48.717) 80%, transparent);
    @supports (color: color-mix(in lab, red, red)) {
      background-color: color-mix(in oklab, var(--color-stone-200) 80%, transparent);
    }
  }
  .bg-stone-800 {
    background-color: var(--color-stone-800);
  }
  .bg-stone-900 {
    background-color: var(--color-stone-900);
  }
  .bg-stone-900\/60 {
    background-color: color-mix(in srgb, oklch(21.6% 0.006 56.043) 60%, transparent);
    @supports (color: color-mix(in lab, red, red)) {
      background-color: color-mix(in oklab, var(--color-stone-900) 60%, transparent);
    }
  }
  .bg-stone-950 {
    background-color: var(--color-stone-950);
  }
  .bg-stone-950\/80 {
    background-color: color-mix(in srgb, oklch(14.7% 0.004 49.25) 80%, transparent);
    @supports (color: color-mix(in lab, red, red)) {
      background-color: color-mix(in oklab, var(--color-stone-950) 80%, transparent);
    }
  }
  .bg-teal-800 {
    background-color: var(--color-teal-800);
  }
  .bg-white {
    background-color: var(--color-white);
  }
  .p-1 {
    padding: calc(var(--spacing) * 1);
  }
  .p-2 {
    padding: calc(var(--spacing) * 2);
  }
  .p-3 {
    padding: calc(var(--spacing) * 3);
  }
  .p-4 {
    padding: calc(var(--spacing) * 4);
  }
  .p-5 {
    padding: calc(var(--spacing) * 5);
  }
  .p-6 {
    padding: calc(var(--spacing) * 6);
  }
  .p-8 {
    padding: calc(var(--spacing) * 8);
  }
  .px-1\.5 {
    padding-inline: calc(var(--spacing) * 1.5);
  }
  .px-2 {
    padding-inline: calc(var(--spacing) * 2);
  }
  .px-2\.5 {
    padding-inline: calc(var(--spacing) * 2.5);
  }
  .px-3 {
    padding-inline: calc(var(--spacing) * 3);
  }
  .px-4 {
    padding-inline: calc(var(--spacing) * 4);
  }
  .px-5 {
    padding-inline: calc(var(--spacing) * 5);
  }
  .py-0\.5 {
    padding-block: calc(var(--spacing) * 0.5);
  }
  .py-1 {
    padding-block: calc(var(--spacing) * 1);
  }
  .py-1\.5 {
    padding-block: calc(var(--spacing) * 1.5);
  }
  .py-2 {
    padding-block: calc(var(--spacing) * 2);
  }
  .py-2\.5 {
    padding-block: calc(var(--spacing) * 2.5);
  }
  .py-3 {
    padding-block: calc(var(--spacing) * 3);
  }
  .py-6 {
    padding-block: calc(var(--spacing) * 6);
  }
  .pt-2 {
    padding-top: calc(var(--spacing) * 2);
  }
  .pt-4 {
    padding-top: calc(var(--spacing) * 4);
  }
  .pt-8 {
    padding-top: calc(var(--spacing) * 8);
  }
  .pb-1 {
    padding-bottom: calc(var(--spacing) * 1);
  }
  .pb-2 {
    padding-bottom: calc(var(--spacing) * 2);
  }
  .pb-4 {
    padding-bottom: calc(var(--spacing) * 4);
  }
  .pb-6 {
    padding-bottom: calc(var(--spacing) * 6);
  }
  .pb-8 {
    padding-bottom: calc(var(--spacing) * 8);
  }
  .pl-2 {
    padding-left: calc(var(--spacing) * 2);
  }
  .pl-3 {
    padding-left: calc(var(--spacing) * 3);
  }
  .pl-4 {
    padding-left: calc(var(--spacing) * 4);
  }
  .text-center {
    text-align: center;
  }
  .text-left {
    text-align: left;
  }
  .text-right {
    text-align: right;
  }
  .font-mono {
    font-family: var(--font-mono);
  }
  .font-sans {
    font-family: var(--font-sans);
  }
  .font-serif {
    font-family: var(--font-serif);
  }
  .text-2xl {
    font-size: var(--text-2xl);
    line-height: var(--tw-leading, var(--text-2xl--line-height));
  }
  .text-base {
    font-size: var(--text-base);
    line-height: var(--tw-leading, var(--text-base--line-height));
  }
  .text-lg {
    font-size: var(--text-lg);
    line-height: var(--tw-leading, var(--text-lg--line-height));
  }
  .text-sm {
    font-size: var(--text-sm);
    line-height: var(--tw-leading, var(--text-sm--line-height));
  }
  .text-xl {
    font-size: var(--text-xl);
    line-height: var(--tw-leading, var(--text-xl--line-height));
  }
  .text-xs {
    font-size: var(--text-xs);
    line-height: var(--tw-leading, var(--text-xs--line-height));
  }
  .text-\[9px\] {
    font-size: 9px;
  }
  .text-\[10px\] {
    font-size: 10px;
  }
  .text-\[11px\] {
    font-size: 11px;
  }
  .leading-normal {
    --tw-leading: var(--leading-normal);
    line-height: var(--leading-normal);
  }
  .leading-relaxed {
    --tw-leading: var(--leading-relaxed);
    line-height: var(--leading-relaxed);
  }
  .font-bold {
    --tw-font-weight: var(--font-weight-bold);
    font-weight: var(--font-weight-bold);
  }
  .font-extrabold {
    --tw-font-weight: var(--font-weight-extrabold);
    font-weight: var(--font-weight-extrabold);
  }
  .font-medium {
    --tw-font-weight: var(--font-weight-medium);
    font-weight: var(--font-weight-medium);
  }
  .font-semibold {
    --tw-font-weight: var(--font-weight-semibold);
    font-weight: var(--font-weight-semibold);
  }
  .tracking-tight {
    --tw-tracking: var(--tracking-tight);
    letter-spacing: var(--tracking-tight);
  }
  .tracking-wide {
    --tw-tracking: var(--tracking-wide);
    letter-spacing: var(--tracking-wide);
  }
  .tracking-wider {
    --tw-tracking: var(--tracking-wider);
    letter-spacing: var(--tracking-wider);
  }
  .tracking-widest {
    --tw-tracking: var(--tracking-widest);
    letter-spacing: var(--tracking-widest);
  }
  .whitespace-nowrap {
    white-space: nowrap;
  }
  .whitespace-pre-wrap {
    white-space: pre-wrap;
  }
  .text-amber-400 {
    color: var(--color-amber-400);
  }
  .text-amber-500 {
    color: var(--color-amber-500);
  }
  .text-amber-800 {
    color: var(--color-amber-800);
  }
  .text-amber-900 {
    color: var(--color-amber-900);
  }
  .text-amber-950 {
    color: var(--color-amber-950);
  }
  .text-green-950 {
    color: var(--color-green-950);
  }
  .text-red-950 {
    color: var(--color-red-950);
  }
  .text-stone-100 {
    color: var(--color-stone-100);
  }
  .text-stone-200 {
    color: var(--color-stone-200);
  }
  .text-stone-300 {
    color: var(--color-stone-300);
  }
  .text-stone-400 {
    color: var(--color-stone-400);
  }
  .text-stone-500 {
    color: var(--color-stone-500);
  }
  .text-stone-600 {
    color: var(--color-stone-600);
  }
  .text-stone-700 {
    color: var(--color-stone-700);
  }
  .text-stone-800 {
    color: var(--color-stone-800);
  }
  .text-stone-900 {
    color: var(--color-stone-900);
  }
  .text-stone-950 {
    color: var(--color-stone-950);
  }
  .text-white {
    color: var(--color-white);
  }
  .uppercase {
    text-transform: uppercase;
  }
  .italic {
    font-style: italic;
  }
  .shadow-lg {
    --tw-shadow: 0 10px 15px -3px var(--tw-shadow-color, rgb(0 0 0 / 0.1)), 0 4px 6px -4px var(--tw-shadow-color, rgb(0 0 0 / 0.1));
    box-shadow: var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow);
  }
  .shadow-sm {
    --tw-shadow: 0 1px 3px 0 var(--tw-shadow-color, rgb(0 0 0 / 0.1)), 0 1px 2px -1px var(--tw-shadow-color, rgb(0 0 0 / 0.1));
    box-shadow: var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow);
  }
  .shadow-xl {
    --tw-shadow: 0 20px 25px -5px var(--tw-shadow-color, rgb(0 0 0 / 0.1)), 0 8px 10px -6px var(--tw-shadow-color, rgb(0 0 0 / 0.1));
    box-shadow: var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow);
  }
  .ring-2 {
    --tw-ring-shadow: var(--tw-ring-inset,) 0 0 0 calc(2px + var(--tw-ring-offset-width)) var(--tw-ring-color, currentcolor);
    box-shadow: var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow);
  }
  .ring-green-600 {
    --tw-ring-color: var(--color-green-600);
  }
  .backdrop-blur {
    --tw-backdrop-blur: blur(8px);
    -webkit-backdrop-filter: var(--tw-backdrop-blur,) var(--tw-backdrop-brightness,) var(--tw-backdrop-contrast,) var(--tw-backdrop-grayscale,) var(--tw-backdrop-hue-rotate,) var(--tw-backdrop-invert,) var(--tw-backdrop-opacity,) var(--tw-backdrop-saturate,) var(--tw-backdrop-sepia,);
    backdrop-filter: var(--tw-backdrop-blur,) var(--tw-backdrop-brightness,) var(--tw-backdrop-contrast,) var(--tw-backdrop-grayscale,) var(--tw-backdrop-hue-rotate,) var(--tw-backdrop-invert,) var(--tw-backdrop-opacity,) var(--tw-backdrop-saturate,) var(--tw-backdrop-sepia,);
  }
  .backdrop-blur-sm {
    --tw-backdrop-blur: blur(var(--blur-sm));
    -webkit-backdrop-filter: var(--tw-backdrop-blur,) var(--tw-backdrop-brightness,) var(--tw-backdrop-contrast,) var(--tw-backdrop-grayscale,) var(--tw-backdrop-hue-rotate,) var(--tw-backdrop-invert,) var(--tw-backdrop-opacity,) var(--tw-backdrop-saturate,) var(--tw-backdrop-sepia,);
    backdrop-filter: var(--tw-backdrop-blur,) var(--tw-backdrop-brightness,) var(--tw-backdrop-contrast,) var(--tw-backdrop-grayscale,) var(--tw-backdrop-hue-rotate,) var(--tw-backdrop-invert,) var(--tw-backdrop-opacity,) var(--tw-backdrop-saturate,) var(--tw-backdrop-sepia,);
  }
  .transition {
    transition-property: color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to, opacity, box-shadow, transform, translate, scale, rotate, filter, -webkit-backdrop-filter, backdrop-filter, display, visibility, content-visibility, overlay, pointer-events;
    transition-timing-function: var(--tw-ease, var(--default-transition-timing-function));
    transition-duration: var(--tw-duration, var(--default-transition-duration));
  }
  .duration-200 {
    --tw-duration: 200ms;
    transition-duration: 200ms;
  }
  .last\:border-none {
    &:last-child {
      --tw-border-style: none;
      border-style: none;
    }
  }
  .hover\:bg-amber-900 {
    &:hover {
      @media (hover: hover) {
        background-color: var(--color-amber-900);
      }
    }
  }
  .hover\:bg-stone-50 {
    &:hover {
      @media (hover: hover) {
        background-color: var(--color-stone-50);
      }
    }
  }
  .hover\:bg-stone-50\/50 {
    &:hover {
      @media (hover: hover) {
        background-color: color-mix(in srgb, oklch(98.5% 0.001 106.423) 50%, transparent);
        @supports (color: color-mix(in lab, red, red)) {
          background-color: color-mix(in oklab, var(--color-stone-50) 50%, transparent);
        }
      }
    }
  }
  .hover\:bg-stone-100\/50 {
    &:hover {
      @media (hover: hover) {
        background-color: color-mix(in srgb, oklch(97% 0.001 106.424) 50%, transparent);
        @supports (color: color-mix(in lab, red, red)) {
          background-color: color-mix(in oklab, var(--color-stone-100) 50%, transparent);
        }
      }
    }
  }
  .hover\:bg-stone-200 {
    &:hover {
      @media (hover: hover) {
        background-color: var(--color-stone-200);
      }
    }
  }
  .hover\:bg-stone-700 {
    &:hover {
      @media (hover: hover) {
        background-color: var(--color-stone-700);
      }
    }
  }
  .hover\:bg-stone-950 {
    &:hover {
      @media (hover: hover) {
        background-color: var(--color-stone-950);
      }
    }
  }
  .hover\:bg-teal-900 {
    &:hover {
      @media (hover: hover) {
        background-color: var(--color-teal-900);
      }
    }
  }
  .hover\:text-stone-900 {
    &:hover {
      @media (hover: hover) {
        color: var(--color-stone-900);
      }
    }
  }
  .hover\:text-white {
    &:hover {
      @media (hover: hover) {
        color: var(--color-white);
      }
    }
  }
  .hover\:shadow {
    &:hover {
      @media (hover: hover) {
        --tw-shadow: 0 1px 3px 0 var(--tw-shadow-color, rgb(0 0 0 / 0.1)), 0 1px 2px -1px var(--tw-shadow-color, rgb(0 0 0 / 0.1));
        box-shadow: var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow);
      }
    }
  }
  .focus\:ring-2 {
    &:focus {
      --tw-ring-shadow: var(--tw-ring-inset,) 0 0 0 calc(2px + var(--tw-ring-offset-width)) var(--tw-ring-color, currentcolor);
      box-shadow: var(--tw-inset-shadow), var(--tw-inset-ring-shadow), var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow);
    }
  }
  .focus\:ring-stone-500 {
    &:focus {
      --tw-ring-color: var(--color-stone-500);
    }
  }
  .focus\:outline-none {
    &:focus {
      --tw-outline-style: none;
      outline-style: none;
    }
  }
  .disabled\:opacity-50 {
    &:disabled {
      opacity: 50%;
    }
  }
  .sm\:grid-cols-2 {
    @media (width >= 40rem) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .md\:w-auto {
    @media (width >= 48rem) {
      width: auto;
    }
  }
  .md\:grid-cols-4 {
    @media (width >= 48rem) {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
  .md\:flex-row {
    @media (width >= 48rem) {
      flex-direction: row;
    }
  }
  .md\:items-center {
    @media (width >= 48rem) {
      align-items: center;
    }
  }
  .md\:justify-between {
    @media (width >= 48rem) {
      justify-content: space-between;
    }
  }
  .md\:p-6 {
    @media (width >= 48rem) {
      padding: calc(var(--spacing) * 6);
    }
  }
  .md\:p-8 {
    @media (width >= 48rem) {
      padding: calc(var(--spacing) * 8);
    }
  }
  .md\:p-12 {
    @media (width >= 48rem) {
      padding: calc(var(--spacing) * 12);
    }
  }
  .md\:py-10 {
    @media (width >= 48rem) {
      padding-block: calc(var(--spacing) * 10);
    }
  }
  .md\:text-2xl {
    @media (width >= 48rem) {
      font-size: var(--text-2xl);
      line-height: var(--tw-leading, var(--text-2xl--line-height));
    }
  }
  .md\:text-base {
    @media (width >= 48rem) {
      font-size: var(--text-base);
      line-height: var(--tw-leading, var(--text-base--line-height));
    }
  }
  .md\:text-lg {
    @media (width >= 48rem) {
      font-size: var(--text-lg);
      line-height: var(--tw-leading, var(--text-lg--line-height));
    }
  }
  .md\:text-sm {
    @media (width >= 48rem) {
      font-size: var(--text-sm);
      line-height: var(--tw-leading, var(--text-sm--line-height));
    }
  }
  .lg\:col-span-1 {
    @media (width >= 64rem) {
      grid-column: span 1 / span 1;
    }
  }
  .lg\:col-span-3 {
    @media (width >= 64rem) {
      grid-column: span 3 / span 3;
    }
  }
  .lg\:grid-cols-4 {
    @media (width >= 64rem) {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
  .print\:inline {
    @media print {
      display: inline;
    }
  }
}
@property --tw-space-y-reverse {
  syntax: "*";
  inherits: false;
  initial-value: 0;
}
@property --tw-border-style {
  syntax: "*";
  inherits: false;
  initial-value: solid;
}
@property --tw-leading {
  syntax: "*";
  inherits: false;
}
@property --tw-font-weight {
  syntax: "*";
  inherits: false;
}
@property --tw-tracking {
  syntax: "*";
  inherits: false;
}
@property --tw-shadow {
  syntax: "*";
  inherits: false;
  initial-value: 0 0 #0000;
}
@property --tw-shadow-color {
  syntax: "*";
  inherits: false;
}
@property --tw-shadow-alpha {
  syntax: "<percentage>";
  inherits: false;
  initial-value: 100%;
}
@property --tw-inset-shadow {
  syntax: "*";
  inherits: false;
  initial-value: 0 0 #0000;
}
@property --tw-inset-shadow-color {
  syntax: "*";
  inherits: false;
}
@property --tw-inset-shadow-alpha {
  syntax: "<percentage>";
  inherits: false;
  initial-value: 100%;
}
@property --tw-ring-color {
  syntax: "*";
  inherits: false;
}
@property --tw-ring-shadow {
  syntax: "*";
  inherits: false;
  initial-value: 0 0 #0000;
}
@property --tw-inset-ring-color {
  syntax: "*";
  inherits: false;
}
@property --tw-inset-ring-shadow {
  syntax: "*";
  inherits: false;
  initial-value: 0 0 #0000;
}
@property --tw-ring-inset {
  syntax: "*";
  inherits: false;
}
@property --tw-ring-offset-width {
  syntax: "<length>";
  inherits: false;
  initial-value: 0px;
}
@property --tw-ring-offset-color {
  syntax: "*";
  inherits: false;
  initial-value: #fff;
}
@property --tw-ring-offset-shadow {
  syntax: "*";
  inherits: false;
  initial-value: 0 0 #0000;
}
@property --tw-backdrop-blur {
  syntax: "*";
  inherits: false;
}
@property --tw-backdrop-brightness {
  syntax: "*";
  inherits: false;
}
@property --tw-backdrop-contrast {
  syntax: "*";
  inherits: false;
}
@property --tw-backdrop-grayscale {
  syntax: "*";
  inherits: false;
}
@property --tw-backdrop-hue-rotate {
  syntax: "*";
  inherits: false;
}
@property --tw-backdrop-invert {
  syntax: "*";
  inherits: false;
}
@property --tw-backdrop-opacity {
  syntax: "*";
  inherits: false;
}
@property --tw-backdrop-saturate {
  syntax: "*";
  inherits: false;
}
@property --tw-backdrop-sepia {
  syntax: "*";
  inherits: false;
}
@property --tw-duration {
  syntax: "*";
  inherits: false;
}
@keyframes pulse {
  50% {
    opacity: 0.5;
  }
}
@layer properties {
  @supports ((-webkit-hyphens: none) and (not (margin-trim: inline))) or ((-moz-orient: inline) and (not (color:rgb(from red r g b)))) {
    *, ::before, ::after, ::backdrop {
      --tw-space-y-reverse: 0;
      --tw-border-style: solid;
      --tw-leading: initial;
      --tw-font-weight: initial;
      --tw-tracking: initial;
      --tw-shadow: 0 0 #0000;
      --tw-shadow-color: initial;
      --tw-shadow-alpha: 100%;
      --tw-inset-shadow: 0 0 #0000;
      --tw-inset-shadow-color: initial;
      --tw-inset-shadow-alpha: 100%;
      --tw-ring-color: initial;
      --tw-ring-shadow: 0 0 #0000;
      --tw-inset-ring-color: initial;
      --tw-inset-ring-shadow: 0 0 #0000;
      --tw-ring-inset: initial;
      --tw-ring-offset-width: 0px;
      --tw-ring-offset-color: #fff;
      --tw-ring-offset-shadow: 0 0 #0000;
      --tw-backdrop-blur: initial;
      --tw-backdrop-brightness: initial;
      --tw-backdrop-contrast: initial;
      --tw-backdrop-grayscale: initial;
      --tw-backdrop-hue-rotate: initial;
      --tw-backdrop-invert: initial;
      --tw-backdrop-opacity: initial;
      --tw-backdrop-saturate: initial;
      --tw-backdrop-sepia: initial;
      --tw-duration: initial;
    }
  }
}


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

  <!-- Compact editable payload. Search for a question sentence to edit it.
       q=question, o=options, k=answer position (1=A, 2=B, 3=C, 4=D), x=explanation. -->
  <script id="runtime-payload" type="application/json">
${serializedData}
  </script>

  <script>
    function unpackEditableSuite(value) {
      if (Array.isArray(value)) return value.map(unpackEditableSuite);
      if (!value || typeof value !== 'object') return value;

      const aliases = {
        v: 'vocabQuestions', r: 'readingPassages', q: 'question', o: 'options',
        k: 'correctAnswer', w: 'wordTested', t: 'answerText',
        x: 'explanation', e: 'explanations', h: 'title', p: 'passage',
        s: 'questions', l: 'level', g: 'gapNumber', y: 'category', a: 'answers'
      };
      const result = {};
      Object.entries(value).forEach(([key, child]) => {
        const restoredKey = aliases[key] || key;
        if (key === 'k' && Number.isInteger(child) && child >= 1 && child <= 10) {
          result[restoredKey] = 'ABCDEFGHIJ'[child - 1];
        } else {
          result[restoredKey] = unpackEditableSuite(child);
        }
      });
      return result;
    }

    const payloadNode = document.getElementById('runtime-payload');
    if (!payloadNode) throw new Error('Missing runtime-payload data block.');
    const EXAM_DATA = unpackEditableSuite(JSON.parse(payloadNode.textContent || '{}'));

    // State object
    let state = {
      answers: {
        vocab: {},       // idx -> "A"|"B"|"C"|"D"
        reading: {}      // pIdx_qIdx -> "A"|"B"|"C"|"D"
      },
      submitted: false,
      startTime: Date.now(),
      elapsedSeconds: 0,
      timerInterval: null
    };

    // Initialize application
    window.addEventListener('DOMContentLoaded', () => {
      try {
        buildQuiz();
        buildNav();
        startStopwatch();
      } catch (error) {
        console.error('Practice page initialization failed:', error);
        const container = document.getElementById('quiz-container');
        if (container) {
          container.innerHTML = '<div style="padding:20px;border:1px solid #fecaca;background:#fff1f2;color:#991b1b;border-radius:16px;font-family:system-ui,sans-serif"><strong>題目載入失敗</strong><br>請重新下載此練習頁，或檢查頁面中的資料區是否仍為有效格式。</div>';
        }
      }
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

    // Handles single selection for Part I and II multiple-choice questions
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
        state.answers = { vocab: {}, reading: {} };
        state.submitted = false;
        state.elapsedSeconds = 0;
        
        // Remove disabled attributes
        const inputs = document.querySelectorAll('.choice-btn, select, input');
        inputs.forEach(i => i.removeAttribute('disabled'));


        // Remove selections
        const btns = document.querySelectorAll('.choice-btn');
        btns.forEach(b => b.classList.remove('choice-selected', 'bg-red-100', 'border-red-400', 'text-red-950', 'bg-green-100', 'border-green-500', 'text-green-950', 'ring-2', 'ring-green-600'));


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

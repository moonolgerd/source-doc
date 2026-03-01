---
name: source-doc Requirements
applyTo: src/**
description: Requirements for the Source Doc VS Code extension
---
# Requirements Document: Source Doc Extension

## 1. Overview

Source Doc is a VS Code extension that places **CodeLens markers** above source code
and, when a marker is clicked, uses the **GitHub Copilot built-in language model API**
(`vscode.lm`) to generate a concise one-sentence explanation. The explanation is
rendered as **inline ghost text** (italic comment) directly after the target line.
No external API key or network configuration is required beyond an active Copilot
subscription.

---

## 2. User Stories with Acceptance Criteria

### US-1 — CodeLens visibility
**As a** developer,
**I want** CodeLens markers to appear automatically when I open a supported file,
**so that** I can trigger explanations without any setup.

**Acceptance Criteria:**
- WHEN a file with a language ID in `sourceDoc.languages` is opened, THE SYSTEM SHALL display CodeLens markers without any user action.
- WHEN `sourceDoc.mode` is `"block"`, THE SYSTEM SHALL place one marker on the first line of every function, method, class, interface, constructor, enum, module, and struct.
- WHEN `sourceDoc.mode` is `"line"`, THE SYSTEM SHALL place one marker on every non-noise line.
- WHEN `sourceDoc.mode` is `"both"`, THE SYSTEM SHALL place both block-level and line-level markers.
- WHEN `sourceDoc.mode` is `"file"`, THE SYSTEM SHALL place only the file-level `$(comment) Explain file` lens at line 0 and no per-line or per-block lenses.
- WHEN `sourceDoc.mode` is `"none"`, THE SYSTEM SHALL show no CodeLens markers at all.
- WHEN the language server has not yet provided document symbols, THE SYSTEM SHALL fall back to regex-based block detection and SHALL retry with symbol-based detection after 2.5 seconds.
- WHEN `sourceDoc.enabled` is `false`, THE SYSTEM SHALL show no CodeLens markers.
- WHEN a file's basename matches a generated-file pattern (`*.d.ts`, `*.g.cs`, `*.g.i.cs`, `*.generated.*`, `*.designer.cs`, `*.min.js/css/mjs`, `*.pb.go`, `assemblyinfo.cs`), THE SYSTEM SHALL show no CodeLens markers.

---

### US-2 — Inline explanation
**As a** developer,
**I want** to click a CodeLens marker and see a plain-English explanation of the code appear on the same line,
**so that** I can understand unfamiliar code without leaving the editor.

**Acceptance Criteria:**
- WHEN a CodeLens marker is clicked, THE SYSTEM SHALL call the GitHub Copilot LM API and stream the response.
- WHEN the explanation is received, THE SYSTEM SHALL render it as italic ghost text after the end of the target line in the colour `editorCodeLens.foreground`.
- WHEN `sourceDoc.maxExplanationLength` is exceeded, THE SYSTEM SHALL truncate the ghost text and append `…`.
- WHEN ghost text is truncated, THE SYSTEM SHALL show the full explanation in a hover tooltip over the line.
- WHEN the same code is explained a second time, THE SYSTEM SHALL return the cached result without calling the API again.
- WHEN a document is edited, THE SYSTEM SHALL automatically remove all ghost text for that document.
- WHEN `sourceDoc.clearExplanations` is run, THE SYSTEM SHALL remove all ghost text across all visible editors.

---

### US-3 — Mode toggling
**As a** developer,
**I want** to switch the CodeLens granularity between block, line, and both,
**so that** I can choose the level of detail that suits my current task.

**Acceptance Criteria:**
- WHEN `sourceDoc.toggleMode` is executed (via command palette or status bar click), THE SYSTEM SHALL cycle `block → line → both → file → none → block` and persist the choice globally.
- WHEN the mode changes, THE SYSTEM SHALL immediately refresh all CodeLens markers without requiring a reload.
- THE SYSTEM SHALL display the current mode in the status bar at all times with a mode-specific codicon.

---

### US-4 — Language configurability
**As a** developer,
**I want** to control which languages show CodeLens markers,
**so that** I can limit noise in files where I don't need explanations.

**Acceptance Criteria:**
- WHEN `sourceDoc.languages` is changed in settings, THE SYSTEM SHALL re-register the CodeLens provider for the new language set without requiring a reload.
- THE SYSTEM SHALL support TypeScript, TSX, JavaScript, JSX, C#, XAML, Python, Java, Go, Kotlin, Dart, Swift, Rust, C, and C++ by default.
- WHEN a language ID is added to `sourceDoc.languages`, THE SYSTEM SHALL activate and show markers for that language.

---

### US-5 — Explain entire file
**As a** developer,
**I want** to trigger explanations for every line in the current file with a single click,
**so that** I can get a full overview of an unfamiliar file without clicking each line individually.

**Acceptance Criteria:**
- THE SYSTEM SHALL display a `$(comment) Explain file` CodeLens at line 0 of every non-generated file (in all modes except `none`).
- WHEN `sourceDoc.explainFile` is invoked, THE SYSTEM SHALL explain all non-noise lines **concurrently** (max 5 in-flight at a time via `runWithConcurrency`) using settled results equivalent to `Promise.allSettled`.
- WHEN `sourceDoc.explainFile` is invoked, THE SYSTEM SHALL display a cancellable progress indicator showing `N / total done`.
- WHEN individual lines fail, THE SYSTEM SHALL continue explaining remaining lines and surface a summary error message at the end.
- WHEN the user cancels, THE SYSTEM SHALL stop issuing new requests and retain any ghost text already applied.
- WHEN invoked on a generated file, THE SYSTEM SHALL show a warning and return without explaining.

---

## 3. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-1 | The extension SHALL activate within 2 seconds of opening a supported file. |
| NFR-2 | Regex-based fallback lenses SHALL appear synchronously so the editor never shows a blank CodeLens gutter. |
| NFR-3 | The LRU explanation cache SHALL hold up to 200 entries and evict the oldest entry when full. |
| NFR-4 | All classes that hold VS Code resources SHALL implement `vscode.Disposable` and register via `context.subscriptions`. |
| NFR-5 | The extension SHALL have zero external runtime dependencies — only VS Code built-in APIs and Node.js stdlib. |
| NFR-6 | Minimum supported VS Code version is **1.90** (when `vscode.lm` was introduced). |
| NFR-7 | Copilot prompt responses SHALL start with a verb and SHALL NOT mention the language name or use boilerplate phrases like "this code". |

---

## 4. Settings Reference

| Setting | Type | Default | Description |
|---|---|---|---|
| `sourceDoc.enabled` | `boolean` | `true` | Master on/off switch for all CodeLens markers |
| `sourceDoc.mode` | `"block"\|"line"\|"both"\|"file"\|"none"` | `"block"` | Granularity of CodeLens markers |
| `sourceDoc.languages` | `string[]` | `["typescript","typescriptreact","javascript","javascriptreact","csharp","xaml","python","java","go","kotlin","dart","swift","rust","c","cpp"]` | Language IDs to activate on |
| `sourceDoc.modelFamily` | `string` | `"gpt-4o"` | Copilot model family; falls back to any available Copilot model |
| `sourceDoc.maxExplanationLength` | `number` (40–400) | `160` | Max ghost-text characters before truncation |

---

## 5. Out of Scope

- Explanation side panels, webviews.
- Support for non-`file://` URI schemes (e.g. virtual filesystems, `git://`).
- Multi-line ghost text or collapsible explanation trees.
- Direct OpenAI / Azure OpenAI integration (Copilot only via `vscode.lm`).

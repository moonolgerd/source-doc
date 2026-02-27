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
- WHEN `sourceDoc.mode` is `"line"`, THE SYSTEM SHALL place one marker on every non-empty line.
- WHEN `sourceDoc.mode` is `"both"`, THE SYSTEM SHALL place both block-level and line-level markers.
- WHEN the language server has not yet provided document symbols, THE SYSTEM SHALL fall back to regex-based block detection and SHALL retry with symbol-based detection after 2.5 seconds.
- WHEN `sourceDoc.enabled` is `false`, THE SYSTEM SHALL show no CodeLens markers.

---

### US-2 — Inline explanation
**As a** developer,
**I want** to click a CodeLens marker and see a plain-English explanation of the code appear on the same line,
**so that** I can understand unfamiliar code without leaving the editor.

**Acceptance Criteria:**
- WHEN a CodeLens marker is clicked, THE SYSTEM SHALL call the GitHub Copilot LM API and stream the response.
- WHEN the explanation is received, THE SYSTEM SHALL render it as italic ghost text after the end of the target line in the colour `editorCodeLens.foreground`.
- WHEN `sourceDoc.maxExplanationLength` is exceeded, THE SYSTEM SHALL truncate the ghost text and append `…`.
- WHEN the same code is explained a second time, THE SYSTEM SHALL return the cached result without calling the API again.
- WHEN a document is edited, THE SYSTEM SHALL automatically remove all ghost text for that document.
- WHEN `sourceDoc.clearExplanations` is run, THE SYSTEM SHALL remove all ghost text across all visible editors.

---

### US-3 — Mode toggling
**As a** developer,
**I want** to switch the CodeLens granularity between block, line, and both,
**so that** I can choose the level of detail that suits my current task.

**Acceptance Criteria:**
- WHEN `sourceDoc.toggleMode` is executed (via command palette or status bar click), THE SYSTEM SHALL cycle `block → line → both → block` and persist the choice globally.
- WHEN the mode changes, THE SYSTEM SHALL immediately refresh all CodeLens markers without requiring a reload.
- THE SYSTEM SHALL display the current mode in the status bar at all times.

---

### US-4 — Language configurability
**As a** developer,
**I want** to control which languages show CodeLens markers,
**so that** I can limit noise in files where I don't need explanations.

**Acceptance Criteria:**
- WHEN `sourceDoc.languages` is changed in settings, THE SYSTEM SHALL re-register the CodeLens provider for the new language set without requiring a reload.
- THE SYSTEM SHALL support TypeScript, TSX, JavaScript, JSX, C#, and XAML by default.
- WHEN a language ID is added to `sourceDoc.languages`, THE SYSTEM SHALL activate and show markers for that language.

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

---

## 4. Settings Reference

| Setting | Type | Default | Description |
|---|---|---|---|
| `sourceDoc.enabled` | `boolean` | `true` | Master on/off switch for all CodeLens markers |
| `sourceDoc.mode` | `"block"\|"line"\|"both"` | `"block"` | Granularity of CodeLens markers |
| `sourceDoc.languages` | `string[]` | `["typescript","typescriptreact","javascript","javascriptreact","csharp","xaml"]` | Language IDs to activate on |
| `sourceDoc.modelFamily` | `string` | `"gpt-4o"` | Copilot model family; falls back to any available Copilot model |
| `sourceDoc.maxExplanationLength` | `number` (40–400) | `160` | Max ghost-text characters before truncation |

---

## 5. Out of Scope

- Explanation side panels, webviews, or hover tooltips.
- Support for non-`file://` URI schemes (e.g. virtual filesystems, `git://`).
- Multi-line ghost text or collapsible explanation trees.
- Direct OpenAI / Azure OpenAI integration (Copilot only via `vscode.lm`).
- Automated test suite (no `@vscode/test-electron` harness in v0.1).

---
name: source-doc Design
applyTo: src/**
description: Architecture and design for the Source Doc VS Code extension
---
# Design Document: Source Doc Extension

## 1. Architecture Overview

Source Doc is structured as five single-responsibility classes wired together in
`extension.ts`'s `activate()` function. All classes implement `vscode.Disposable`
and are registered via `context.subscriptions` so VS Code cleans them up automatically
on deactivation.

```
src/
├── extension.ts            — activate() / deactivate(), command registration
├── codeLensProvider.ts     — SourceDocCodeLensProvider
├── explanationProvider.ts  — ExplanationProvider (Copilot + LRU cache)
├── decorationManager.ts    — DecorationManager (ghost-text decorations)
├── statusBar.ts            — SourceDocStatusBar
└── util.ts                 — contentHash(), truncate(), languageLabel()
```

### Key Design Principles

- **Single responsibility** — each file owns exactly one concern.
- **No external runtime dependencies** — VS Code built-in APIs + Node.js `crypto` only.
- **Lazy configuration reads** — `vscode.workspace.getConfiguration('sourceDoc')` is
  called at invocation time, never cached at construction, so settings changes are
  always reflected without a reload.
- **Disposable hygiene** — every `EventEmitter`, `TextEditorDecorationType`, and
  registered listener is disposed through `context.subscriptions` or a local
  `disposables` array.

---

## 2. Components

### 2.1 `SourceDocCodeLensProvider` — `codeLensProvider.ts`

**Implements:** `vscode.CodeLensProvider`
**Registered via:** `vscode.languages.registerCodeLensProvider({ scheme: 'file', language: <id> }, provider)`

**Exported helpers (reused by `extension.ts`):**
- `isGeneratedFile(document)` — returns `true` for `*.d.ts`, `*.g.cs`, `*.g.i.cs`, `*.generated.*`, `*.designer.cs`, `*.min.js/css/mjs`, `*.pb.go`, `assemblyinfo.cs`. Files matching this are shown no lenses.
- `isNoiseLine(trimmed, languageId)` — returns `true` for blank lines, pure-punctuation lines, comment lines, import/using directives, structural keywords (`try`/`finally`/`else`/`do`), and XAML closing tags.

**Responsibilities:**
- Produce `vscode.CodeLens` objects for every open document of a configured language.
- Support five modes: `block`, `line`, `both`, `file`, `none` (read from `sourceDoc.mode` at call time).
- Return `[]` immediately for generated files or when `mode === 'none'`.
- **Always** add a file-level `$(comment) Explain file` lens at line 0 (for all modes except `none`).
- **Block mode (symbol-based):** call `vscode.executeDocumentSymbolProvider`; filter to
  `SymbolKind` values `Function`, `Method`, `Class`, `Interface`, `Constructor`,
  `Property`, `Enum`, `Module`, `Struct`; recurse into `sym.children`.
- **Block mode (regex fallback):** when the symbol provider returns `[]` (language server
  not yet loaded), call `regexBlockLenses()` immediately and schedule a debounced 2.5 s
  `setTimeout` retry via `_onDidChangeCodeLenses.fire()`.
- **Line mode:** iterate `document.lineCount`, skip noise lines.
- **File mode:** only the file-level lens; skip per-line and per-block lenses.
- Fire `onDidChangeCodeLenses` on `sourceDoc.enabled` / `sourceDoc.mode` config changes,
  `onDidChangeActiveTextEditor`, and `onDidOpenTextDocument`.
- Public `refresh()` method for the `sourceDoc.refreshLenses` command.

**Block regex — code files:**
```
/^[ \t]*((?:export\s+)?(?:default\s+)?(?:async\s+)?function[\s*]+\w+
  |(?:export\s+)?(?:abstract\s+|sealed\s+)?class\s+\w+
  |(?:export\s+)?(?:abstract\s+)?interface\s+\w+
  |(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>
  |(?:public|private|protected|internal)(?:\s+(?:static|override|virtual|abstract|async|readonly))*\s+\S+\s+\w+\s*[({]
  |def\s+\w+\s*\(
  |fn\s+\w+\s*[(<]
  |func\s+\w+\s*[(<])/
```

**Block regex — XAML / XML:**
```
/^[ \t]*<([A-Z][A-Za-z0-9.]*)(?:[\s>]|\/>)/
```
For XAML, up to 30 lines of element content are gathered (stopping at the first
closing tag or self-closing line) to give Copilot richer context.

**CodeLens command arguments (`ExplainArgs`):**
```typescript
interface ExplainArgs {
    uri: vscode.Uri;            // document URI (may be plain object after JSON round-trip)
    line: number;               // 0-based target line for ghost text placement
    code: string;               // code text to send to Copilot
    languageId: string;         // VS Code language ID
    range?: vscode.Range | null; // symbol range; null when using regex fallback
}
```

---

### 2.2 `ExplanationProvider` — `explanationProvider.ts`

**Implements:** `vscode.Disposable`

**Responsibilities:**
- Call `vscode.lm.selectChatModels({ vendor: 'copilot', family: <modelFamily> })`.
- Fall back to any available Copilot model if the configured family is unavailable.
- Build a deterministic prompt requesting plain English, no markdown, max 30 words.
- Stream `response.text` chunks into a result string, respecting `CancellationToken`.
- Surface `vscode.LanguageModelError` codes in user-facing error messages.
- Maintain an LRU cache: `Map<contentHash, {text, timestamp}>`, max 200 entries,
  evict the entry with the oldest `timestamp` when the cache is full.
- `invalidateCache()` clears all entries.

**Copilot prompt template:**
```
You are a code documentation assistant. Explain what the following code does
in one concise sentence (max 20 words).
Start directly with a verb (e.g. "Initializes…", "Returns…", "Checks…").
Do NOT mention the language, do NOT say "this code" or "this function".
No markdown, no backticks, no line breaks. Plain text only.

Code:
```<languageId>
<code>
```
```

---

### 2.3 `DecorationManager` — `decorationManager.ts`

**Implements:** `vscode.Disposable`

**Responsibilities:**
- Own a single shared `TextEditorDecorationType`:
  ```typescript
  after: {
      color: new vscode.ThemeColor('editorCodeLens.foreground'),
      fontStyle: 'italic',
      margin: '0 0 0 2em',
  },
  rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
  ```
- Maintain two maps per editor:
  - `displayMap`: `Map<uriString, Map<lineNumber, truncatedText>>` — shown inline.
  - `fullMap`: `Map<uriString, Map<lineNumber, fullText>>` — used by hover provider.
- `setExplanation(editor, line, text, maxLength)`: truncate via `util.truncate()`,
  update both maps, call `editor.setDecorations()` with the full display map contents.
- Ghost text content format: `  // <explanation>`
- `getFullExplanation(uriString, line)` — returns unexpurgated text for the hover provider.
- `clearForEditor(editor)` — remove entries and decorations for one editor.
- `clearAll()` — clear all entries and call `setDecorations([])` on all visible editors.
- Auto-clear via `onDidChangeTextDocument` (edits) and `onDidCloseTextDocument` (close).

---

### 2.4 `SourceDocStatusBar` — `statusBar.ts`

**Implements:** `vscode.Disposable`

**Responsibilities:**
- Create a `StatusBarItem` at `StatusBarAlignment.Right`, priority 100.
- Command: `sourceDoc.toggleMode` (click cycles the mode).
- `update()` sets text with mode-specific codicon:
  - `block` → `$(symbol-method) Source Doc: block`
  - `line`  → `$(list-flat) Source Doc: line`
  - `both`  → `$(list-tree) Source Doc: both`
  - `file`  → `$(file) Source Doc: file`
  - `none`  → `$(circle-slash) Source Doc: none`
  - disabled → `$(comment) Source Doc: off` with `statusBarItem.warningBackground`
- Subscribe to `onDidChangeConfiguration` for `sourceDoc.enabled` and `sourceDoc.mode`.

---

### 2.5 `util.ts` — Shared Helpers

| Export | Signature | Purpose |
|---|---|---|
| `contentHash` | `(text: string) => string` | First 16 hex chars of SHA-256(text); LRU cache key |
| `truncate` | `(text: string, maxLength: number) => string` | Collapse whitespace, trim, append `…` if over limit |
| `languageLabel` | `(languageId: string) => string` | VS Code language ID → human-readable name for Copilot prompts. Covers TypeScript/TSX, JavaScript/JSX, C#, XAML, Python, Java, Go, Kotlin, Dart, Swift, Rust, C, C++, Ruby. Falls back to raw ID for unmapped languages. |

### 2.6 `extension.ts` — Command Registration

**Commands registered:**

| Command | Handler |
|---|---|
| `sourceDoc.explainLine` | `runExplain(args)` |
| `sourceDoc.explainBlock` | `runExplain(args)` |
| `sourceDoc.explainFile` | Collect non-noise lines; `runWithConcurrency(lines, 5, explain)` (max 5 in-flight); apply decorations as each resolves; show cancellable progress `N / total done`; show first error with total failure count |
| `sourceDoc.toggleMode` | Cycle `block → line → both → file → none → block` |
| `sourceDoc.clearExplanations` | `decorationManager.clearAll()` |
| `sourceDoc.refreshLenses` | `codeLensProvider.refresh()` |

**Hover provider** registered for `{ scheme: 'file' }`: returns a `vscode.Hover` with the full explanation when `decorationManager.getFullExplanation()` indicates the ghost text was truncated.

---

## 3. Data Flow

```
User opens file
       │
       ▼
SourceDocCodeLensProvider.provideCodeLenses(document)
       │  isGeneratedFile() → return []
       │  mode === 'none'   → return []
       │
       ├─ always: file-level "Explain file" lens at line 0
       ├─ [block] vscode.executeDocumentSymbolProvider
       │           └─ empty → regexBlockLenses() + scheduleRetry(2500 ms)
       ├─ [line]  iterate non-noise lines (isNoiseLine)
       └─ [file]  skip per-line and per-block lenses
       │
       ▼
CodeLens rendered — user clicks marker
       │
       ├─ explainLine / explainBlock
       │     └─ extension.ts: runExplain(args)
       │           │  reconstruct vscode.Uri · find editor · withProgress(cancellable)
       │           └─ ExplanationProvider.explain(code, languageId, token)
       │               ├─ cache hit  → return immediately
       │               └─ cache miss → vscode.lm.selectChatModels({ vendor: 'copilot' })
       │                               stream response.text chunks · addToCache
       │
       └─ explainFile
             │  isGeneratedFile() guard
             │  collect non-noise lines
             │  withProgress(cancellable)
             └─ Promise.allSettled(lines.map(line =>
                    ExplanationProvider.explain(line.code, languageId, token)
                    .then(text => decorationManager.setExplanation(editor, line, text))
                ))
                aggregate errors → showErrorMessage
       │
       ▼
DecorationManager.setExplanation(editor, line, text, maxLength)
       ├─ displayMap (truncated) → editor.setDecorations()
       └─ fullMap (full text) → HoverProvider.provideHover() when truncated
```

---

## 4. Activation & Lifecycle

- **`activationEvents`**: `onStartupFinished` + `onLanguage:<id>` for each default
  language (TypeScript, TSX, JavaScript, JSX, C#, XAML, Python, Java, Go, Kotlin, Dart, Swift, Rust, C++, C).
- **`activate()`**: instantiates all four classes, pushes to `context.subscriptions`,
  calls `registerCodeLensProviders()`, wires commands and config-change listeners.
- **`deactivate()`**: no-op — VS Code disposes all `context.subscriptions` entries.
- **Dynamic language re-registration**: when `sourceDoc.languages` changes, all previous
  `registerCodeLensProvider` disposables are disposed and new ones registered for the
  updated language list.

---

## 5. Error Handling

| Scenario | Source | Handling |
|---|---|---|
| No Copilot model found | `ExplanationProvider` | Throws with user-friendly message; shown via `showErrorMessage` |
| `vscode.LanguageModelError` | `ExplanationProvider` | Code + message surfaced to user |
| Symbol provider returns `[]` | `SourceDocCodeLensProvider` | Regex fallback + 2.5 s debounced retry |
| `args.uri` is a plain JSON object | `runExplain` | `vscode.Uri.from(args.uri)` reconstruction |
| Document edited after explanation | `DecorationManager` | `onDidChangeTextDocument` clears all decorations for that document |
| Active editor not found | `runExplain` | `showWarningMessage` and early return |

---

## 6. Extension Manifest Highlights

- **`engines.vscode`**: `^1.90.0` (minimum for `vscode.lm`)
- **`main`**: `./out/extension.js`
- **`contributes.commands`**: `explainLine`, `explainBlock`, `toggleMode`,
  `clearExplanations`, `refreshLenses`
- **`contributes.configuration`**: `enabled`, `mode`, `languages`, `modelFamily`,
  `maxExplanationLength`
- **No `contributes.codeLenses`** entry is needed — CodeLens providers are
  registered entirely in code via `languages.registerCodeLensProvider`.

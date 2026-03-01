# GitHub Copilot Instructions — Source Doc

## Project Summary

Source Doc is a VS Code extension that places **CodeLens markers** above source code and, when clicked, uses the **GitHub Copilot built-in LM API** (`vscode.lm`) to generate concise inline explanations rendered as ghost text.

---

## Architecture

```
src/
├── extension.ts            — activate() / deactivate(), command + hover provider registration
├── codeLensProvider.ts     — SourceDocCodeLensProvider + isNoiseLine() + isGeneratedFile()
├── explanationProvider.ts  — Copilot LM integration + LRU cache (200 entries)
├── decorationManager.ts    — inline ghost-text (after decoration) + hover full-text map
├── statusBar.ts            — SourceDocStatusBar (mode indicator)
└── util.ts                 — contentHash(), truncate(), languageLabel()
```

All classes implement `vscode.Disposable` and are pushed to `context.subscriptions`.
No external runtime dependencies — VS Code built-ins + Node.js `crypto` only.

---

## ExplainMode

```typescript
export type ExplainMode = 'line' | 'block' | 'both' | 'file' | 'none';
```

| Mode   | Behaviour |
|--------|-----------|
| `block` | One lens per function/class/method (symbol provider + regex fallback) |
| `line`  | One lens per non-noise line |
| `both`  | Both block and line lenses |
| `file`  | Only the file-level `$(comment) Explain file` lens at line 0 |
| `none`  | No lenses at all |

**Toggle cycle:** `block → line → both → file → none → block`

---

## CodeLens Rules

- **Generated files** (`*.d.ts`, `*.g.cs`, `*.g.i.cs`, `*.generated.*`, `*.designer.cs`, `*.min.js/css/mjs`, `*.pb.go`, `assemblyinfo.cs`) receive **no lenses**.
- **Noise lines** are suppressed from `line` mode:
  - Empty / whitespace-only
  - No word characters (pure punctuation like `}`, `]);`)
  - Single-line comments: `//`, `#`, `--`, `%%`, `;`
  - Block comment lines: `/*`, ` * `, ` */`
  - Structural-only keywords: `try`, `finally`, `else`, `do` (with optional `{`)
  - Import/using/require/include directives
  - XAML closing tags `</…>` and `<!--`
- **File-level lens** at line 0 is shown in **all modes except `none`**.
- Block detection tries `vscode.executeDocumentSymbolProvider` first; falls back to regex; schedules a 2.5 s retry.

---

## Copilot Prompt Rules

Prompt to model (in `explanationProvider.ts`):
- Max **20 words**, plain text only, no markdown or backticks
- **Start with a verb** (e.g. "Initializes…", "Returns…", "Checks…")
- **Do NOT** mention the language, say "this code", or use "this function"

---

## Ghost Text & Hover

- `DecorationManager` uses a single `after` `TextEditorDecorationType`:
  - colour: `editorCodeLens.foreground`, italic, `margin: 0 0 0 2em`
  - content: `  // <explanation>`
- Maintains two maps: **displayMap** (truncated) and **fullMap** (full text).
- Listens to `onDidChangeVisibleTextEditors` and re-applies stored decorations whenever the visible editor set changes — ghost text persists across tab switches.
- Auto-clears on `onDidChangeTextDocument` and `onDidCloseTextDocument`.
- `HoverProvider` (registered in `extension.ts`) shows full text when the decorated line's explanation exceeds `sourceDoc.maxExplanationLength`.

---

## explainFile Command

`sourceDoc.explainFile`:
1. Guards against generated files.
2. Collects all non-noise lines via `isNoiseLine`.
3. Explains lines via `runWithConcurrency(lines, 5, ...)` — max **5 concurrent** Copilot requests to avoid rate-limit errors on large files.
4. Applies decorations as each result arrives.
5. Shows cancellable progress bar: `N / total done`.
6. Surfaces aggregate error summary if any lines fail.

`runWithConcurrency<T>(items, limit, fn)` is a private helper in `extension.ts` that returns a `PromiseSettledResult[]` (same shape as `Promise.allSettled`) while keeping at most `limit` in-flight at a time.

---

## Settings

| Setting | Default | Notes |
|---------|---------|-------|
| `sourceDoc.enabled` | `true` | Master on/off switch |
| `sourceDoc.mode` | `"block"` | `line \| block \| both \| file \| none` |
| `sourceDoc.languages` | `["typescript","typescriptreact","javascript","javascriptreact","csharp","xaml"]` | Language IDs |
| `sourceDoc.modelFamily` | `"gpt-4o"` | Copilot model family |
| `sourceDoc.maxExplanationLength` | `160` | 40–400 chars |

---

## Coding Conventions

- All configuration is read at **call time** via `vscode.workspace.getConfiguration('sourceDoc')` — never cached at construction.
- `vscode.Uri` args from CodeLens commands are **JSON-serialised plain objects** — always reconstruct via `vscode.Uri.from(args.uri)`.
- TypeScript strict mode; `ES2020` target; `commonjs` module; `"types": ["node"]`.
- Status bar icons: `$(symbol-method)` block · `$(list-flat)` line · `$(list-tree)` both · `$(file)` file · `$(circle-slash)` none · `$(comment)` disabled.

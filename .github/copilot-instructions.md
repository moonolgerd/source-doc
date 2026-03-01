# GitHub Copilot Instructions — Source Doc

## Project Summary

Source Doc is a VS Code extension that places **CodeLens markers** above source code and, when clicked, uses the **GitHub Copilot built-in LM API** (`vscode.lm`) to generate concise inline explanations rendered as ghost text.

---

## Architecture

```
src/
├── extension.ts            — activate() / deactivate(), command + hover provider registration,
│                             registerCodeLensProviders(), runWithConcurrency(), runExplain()
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
  - Import/using/require/include/use directives — regex: `^(import\s|export\s+\*|from\s+'|from\s+"|from\s+\w|require\s*\(|using\s+[\w.]+;|#include\s*[<"]|use\s+[\w:*{])`
    - covers JS/TS `import`/`export *`, Python `from x import`, `require(`, C# `using`, C/C++ `#include`, Rust `use`
  - XAML/XML closing tags `</…>` and `<!--`
- **File-level lens** at line 0 is shown in **all modes except `none`**.
- Block detection tries `vscode.executeDocumentSymbolProvider` first; falls back to `regexBlockLenses()`; schedules a 2.5 s debounced retry via `scheduleRetry()`.
- Regex fallback (`CODE_RE`) covers: `function`, `class`, `interface`, arrow functions (TS/JS), access-modifier methods (C#/Java/Kotlin), `def` (Python), `fn` (Rust), `func` (Go/Swift). For XAML/XML a separate `XAML_RE` matches PascalCase opening tags.
- `registerCodeLensProviders()` in `extension.ts` registers the provider per language and **re-registers automatically** when `sourceDoc.languages` changes at runtime.

---

## Copilot Prompt Rules

Prompt to model (in `explanationProvider.ts`):
- Max **20 words**, plain text only, no markdown or backticks
- **Start with a verb** (e.g. "Initializes…", "Returns…", "Checks…")
- **Do NOT** mention the language, say "this code", or use "this function"
- Language ID is passed as the fenced-code-block hint but not referenced in the instruction text

---

## Ghost Text & Hover

- `DecorationManager` uses a single `after` `TextEditorDecorationType`:
  - colour: `editorCodeLens.foreground`, italic, `margin: 0 0 0 2em`
  - content: `  // <explanation>`
- Maintains two maps: **displayMap** (truncated) and **fullMap** (full text).
- Listens to `onDidChangeVisibleTextEditors` and re-applies stored decorations whenever the visible editor set changes — ghost text persists across tab switches.
- Auto-clears on `onDidChangeTextDocument` and `onDidCloseTextDocument`.
- `HoverProvider` (registered in `extension.ts` with `{ scheme: 'file' }`) shows full text when the decorated line's explanation exceeds `sourceDoc.maxExplanationLength`.

---

## explainFile Command

`sourceDoc.explainFile`:
1. Guards against generated files (shows a warning and returns early).
2. Collects all non-noise lines via `isNoiseLine`.
3. Explains lines via `runWithConcurrency(lines, 5, ...)` — max **5 concurrent** Copilot requests to avoid rate-limit errors on large files.
4. Applies decorations as each result arrives.
5. Shows cancellable progress bar in the status bar: `N / total done`.
6. On failure, shows the **first** error message (with a count of total failures).

`runWithConcurrency<T>(items, limit, fn)` is a private helper in `extension.ts` that returns a `PromiseSettledResult[]` (same shape as `Promise.allSettled`) while keeping at most `limit` in-flight at a time.

---

## util.ts — languageLabel()

Maps VS Code language IDs to human-readable names used as fenced-code hints in Copilot prompts. Falls back to the raw language ID for unmapped languages.

| Language ID | Label |
|-------------|-------|
| `typescript` / `typescriptreact` | TypeScript / TypeScript (React/TSX) |
| `javascript` / `javascriptreact` | JavaScript / JavaScript (React/JSX) |
| `csharp` | C# |
| `xaml` | XAML |
| `python` | Python |
| `java` | Java |
| `go` | Go |
| `kotlin` | Kotlin |
| `dart` | Dart |
| `swift` | Swift |
| `rust` | Rust |
| `c` / `cpp` | C / C++ |
| `ruby` | Ruby |

---

## Settings

| Setting | Default | Notes |
|---------|---------|-------|
| `sourceDoc.enabled` | `true` | Master on/off switch |
| `sourceDoc.mode` | `"block"` | `line \| block \| both \| file \| none` |
| `sourceDoc.languages` | `["typescript","typescriptreact","javascript","javascriptreact","csharp","xaml","python","java","go","kotlin","dart","swift","rust","c","cpp"]` | Language IDs for CodeLens registration |
| `sourceDoc.modelFamily` | `"gpt-4o"` | Copilot model family |
| `sourceDoc.maxExplanationLength` | `160` | 40–400 chars |

---

## Coding Conventions

- All configuration is read at **call time** via `vscode.workspace.getConfiguration('sourceDoc')` — never cached at construction.
- `vscode.Uri` args from CodeLens commands are **JSON-serialised plain objects** — always reconstruct via `vscode.Uri.from(args.uri)` (see `runExplain()` and `explainFile` handler).
- TypeScript strict mode; `ES2020` target; `commonjs` module; `"types": ["node"]`.
- Status bar icons: `$(symbol-method)` block · `$(list-flat)` line · `$(list-tree)` both · `$(file)` file · `$(circle-slash)` none · `$(comment)` disabled.

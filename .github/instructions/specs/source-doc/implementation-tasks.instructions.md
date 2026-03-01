---
name: source-doc Implementation Tasks
applyTo: src/**
description: Implementation task list for the Source Doc VS Code extension
---
<!-- files: src/** -->

- [x] <!-- task:T1 --> Scaffold extension project
  - [x] Create `package.json` with `contributes.commands`, `contributes.configuration`, `engines.vscode: ^1.90.0`, and `activationEvents`.
  - [x] Create `tsconfig.json` (target ES2020, module commonjs, strict mode, `types: ["node"]`).
  - [x] Create `.vscode/launch.json` (extensionHost debug config) and `.vscode/tasks.json` (default `tsc --watch` build task).
  - [x] Create `.vscodeignore` and `.gitignore` (Node.js template).
  - [x] Install `@types/vscode`, `@types/node`, `typescript` as devDependencies.

- [x] <!-- task:T2 --> Implement `src/util.ts`
  - [x] `contentHash(text)` — SHA-256 via Node.js `crypto`, returns first 16 hex chars.
  - [x] `truncate(text, maxLength)` — collapse whitespace, trim, append `…` if over limit.
  - [x] `languageLabel(languageId)` — map VS Code language ID to human-readable name for Copilot prompts.

- [x] <!-- task:T3 --> Implement `src/explanationProvider.ts`
  - [x] `ExplanationProvider` class implementing `vscode.Disposable`.
  - [x] `explain(code, languageId, token)` — select Copilot model via `vscode.lm.selectChatModels`; fall back to any available Copilot model if configured family is unavailable.
  - [x] Stream `response.text` chunks into a result string, respecting `CancellationToken`.
  - [x] Surface `vscode.LanguageModelError` with code in user-facing message.
  - [x] LRU cache: `Map<contentHash, {text, timestamp}>`, max 200 entries, evict oldest on overflow.
  - [x] `invalidateCache()` helper to clear all cached entries.

- [x] <!-- task:T4 --> Implement `src/decorationManager.ts`
  - [x] `DecorationManager` class implementing `vscode.Disposable`.
  - [x] Single shared `TextEditorDecorationType`: `after` with `editorCodeLens.foreground`, italic, `margin: '0 0 0 2em'`, `ClosedClosed` range behaviour.
  - [x] `setExplanation(editor, line, text, maxLength)` — truncate, store in `Map<uri, Map<line, text>>`, call `editor.setDecorations` with full set.
  - [x] `clearForEditor(editor)` and `clearAll()` — clear map entries and remove decorations.
  - [x] Auto-clear on `onDidChangeTextDocument` and `onDidCloseTextDocument`.

- [x] <!-- task:T5 --> Implement `src/codeLensProvider.ts`
  - [x] `SourceDocCodeLensProvider` implementing `vscode.CodeLensProvider` with `onDidChangeCodeLenses` event.
  - [x] `provideCodeLenses(document)` — branch on `sourceDoc.mode` (`block` / `line` / `both` / `file` / `none`).
  - [x] Return `[]` immediately for generated files (`isGeneratedFile`) or when `mode === 'none'`.
  - [x] Always add a file-level `$(comment) Explain file` CodeLens at line 0 (for all modes except `none`).
  - [x] Block mode (symbol-based): `vscode.executeDocumentSymbolProvider`; recurse into `sym.children`; filter to 9 relevant `SymbolKind` values.
  - [x] Regex fallback when symbol provider returns `[]`: `regexBlockLenses()` with separate code and XAML/XML regexes.
  - [x] XAML context gathering: collect up to 30 lines until closing/self-closing tag.
  - [x] `scheduleRetry()` — debounced 2.5 s `setTimeout` that fires `_onDidChangeCodeLenses`.
  - [x] Line mode: iterate `document.lineCount`, skip noise lines via `isNoiseLine`.
  - [x] File mode: only the file-level lens, no per-line/per-block lenses.
  - [x] Exported top-level `isNoiseLine(trimmed, languageId)` and `isGeneratedFile(document)` helpers.
  - [x] Fire refresh on `sourceDoc.enabled` / `sourceDoc.mode` config changes, `onDidChangeActiveTextEditor`, `onDidOpenTextDocument`.
  - [x] Public `refresh()` method for the `sourceDoc.refreshLenses` command.

- [x] <!-- task:T6 --> Implement `src/statusBar.ts`
  - [x] `SourceDocStatusBar` implementing `vscode.Disposable`.
  - [x] Right-aligned `StatusBarItem`, priority 100, command `sourceDoc.toggleMode`.
  - [x] `update()` — set text with mode-specific codicon; set `warningBackground` when disabled.
  - [x] Subscribe to `onDidChangeConfiguration` for `sourceDoc.enabled` and `sourceDoc.mode`.

- [x] <!-- task:T7 --> Implement `src/extension.ts`
  - [x] `activate()`: instantiate all four classes, push to `context.subscriptions`.
  - [x] `registerCodeLensProviders()`: read `sourceDoc.languages`, call `vscode.languages.registerCodeLensProvider` per language.
  - [x] Dynamic re-registration on `sourceDoc.languages` config change.
  - [x] Register 6 commands: `explainLine`, `explainBlock`, `explainFile`, `toggleMode`, `clearExplanations`, `refreshLenses`.
  - [x] `runExplain()`: reconstruct `vscode.Uri` from JSON-serialised args; find editor; show cancellable progress; call `ExplanationProvider`; apply via `DecorationManager`.
  - [x] `explainFile` command: collect non-noise lines; explain all concurrently via `runWithConcurrency(lines, 5, ...)` (max 5 in-flight); apply decorations as each resolves; progress shows `N / total done`; show first error with total count.
  - [x] Hover provider registered for `{ scheme: 'file' }` — returns full explanation when `DecorationManager.getFullExplanation()` indicates text was truncated.
  - [x] `toggleMode` cycles `block → line → both → file → none → block`.
  - [x] `deactivate()`: no-op (subscriptions handle cleanup).

- [x] <!-- task:T8 --> Fix activation and lens visibility issues
  - [x] Add per-language `onLanguage:<id>` activation events so the extension loads when a file opens.
  - [x] Fix `vscode.Uri` reconstruction in `runExplain` (command args are JSON-serialised plain objects).
  - [x] Add `onDidChangeActiveTextEditor` and `onDidOpenTextDocument` refresh triggers.

- [x] <!-- task:T9 --> Extend language support (TSX, XAML)
  - [x] Add `typescriptreact` and `xaml` to default `sourceDoc.languages` and `activationEvents`.
  - [x] Add XAML PascalCase element regex and multi-line context capture in `regexBlockLenses()`.
  - [x] Add `typescriptreact`, `javascriptreact`, `xaml` labels to `languageLabel()` in `util.ts`.

- [x] <!-- task:T15 --> Extend language support (Python, Java, Go, Kotlin, Dart, Swift, Rust, C, C++)
  - [x] Add `python`, `java`, `go`, `kotlin`, `dart`, `swift`, `rust`, `c`, `cpp` to `sourceDoc.languages` default and `activationEvents` in `package.json`.
  - [x] Extend `isNoiseLine` import-directive regex with `from\s+\w` (Python `from x import`) and `use\s+[\w:*{]` (Rust `use`) alternatives.
  - [x] Add `python`, `java`, `go`, `kotlin`, `dart`, `swift`, `rust`, `c`, `cpp` labels to `languageLabel()` in `util.ts`.
  - [x] Add import-noise and real-code test cases for all new languages in `codeLensProvider.test.ts`.

- [x] <!-- task:T10 --> Project hygiene & documentation
  - [x] `.gitignore` with full Node.js template.
  - [x] `README.md` with features, requirements, commands, settings, architecture diagram.
  - [x] `CONTRIBUTING.md` with setup, workflow, coding conventions, guide for adding languages.
  - [x] `CHANGELOG.md` following Keep a Changelog / SemVer.
  - [x] GitHub Actions CI: compile + type-check on Ubuntu & Windows; VSIX packaging on push.

- [x] <!-- task:T11 --> Add automated tests
  - [x] Set up `@vscode/test-electron` harness.
  - [x] Unit-test `util.ts` (`contentHash`, `truncate`, `languageLabel`).
  - [x] Unit-test `isNoiseLine` and `isGeneratedFile` helpers.
  - [x] Integration-test `SourceDocCodeLensProvider` with a fixture TypeScript file.
  - [x] Integration-test `DecorationManager` decoration application and auto-clear.
  - [x] Mock `vscode.lm` to test `ExplanationProvider` cache and error paths.
  - [x] Test `explainFile` parallel execution and cancellation.

- [x] <!-- task:T13 --> Noise filtering, generated-file guard, hover tooltip
  - [x] `isNoiseLine(trimmed, languageId)` — suppress CodeLens on empty, no-word-char, comment, import/using, and structural-keyword lines (`try`/`finally`/`else`/`do`).
  - [x] `isGeneratedFile(document)` — skip `*.d.ts`, `*.g.cs`, `*.g.i.cs`, `*.generated.*`, `*.designer.cs`, `*.min.js/css/mjs`, `*.pb.go`, `assemblyinfo.cs`.
  - [x] `DecorationManager` tracks `fullMap` alongside `displayMap`; `getFullExplanation(uri, line)` exposed for hover.
  - [x] Hover provider in `extension.ts` shows full text when ghost text is truncated.
  - [x] Copilot prompt revised: max 20 words, start with verb, no language name, no "this code" boilerplate.

- [x] <!-- task:T14 --> Explain file command + file/none modes
  - [x] `sourceDoc.explainFile` command: collect non-noise lines, explain all concurrently via `Promise.allSettled`, apply decorations as results arrive, cancellable progress `N / total done`.
  - [x] `ExplainMode` extended to `'line' | 'block' | 'both' | 'file' | 'none'`.
  - [x] `file` mode: only file-level lens at line 0; no per-line or per-block lenses.
  - [x] `none` mode: no lenses at all.
  - [x] `SourceDocStatusBar` updated with `$(file)` and `$(circle-slash)` icons for new modes.
  - [x] `package.json` `sourceDoc.mode` enum updated with `file` and `none` entries.

- [x] <!-- task:T12 --> Publish to VS Code Marketplace
  - [x] Add `publisher`, `repository`, `icon`, `categories`, `bugs`, `homepage`, `galleryBanner`, `license` to `package.json`.
  - [x] Replace `<your-org>` placeholders in `CHANGELOG.md` and `CONTRIBUTING.md` with `source-doc/source-doc`.
  - [x] Add `LICENSE` (MIT) and `images/icon.png` (128×128 programmatically generated PNG).
  - [x] Update `.vscodeignore` to exclude `.github/`, `.copilot-specs-cache/`, `CONTRIBUTING.md` from VSIX.
  - [x] Run `vsce package --no-dependencies` — produces `source-doc-0.1.0.vsix` (19 files, 24 KB, no warnings).
  - [x] Publish via `vsce publish` — requires a Personal Access Token from the VS Code Marketplace publisher portal.

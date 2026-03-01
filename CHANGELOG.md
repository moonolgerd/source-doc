# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.3.0] — 2026-02-28

### Added

- **Expanded default language support** — CodeLens markers now activate out-of-the-box for Python, Java, Go, Kotlin, Dart, Swift, Rust, C, and C++ in addition to the existing TypeScript/TSX, JavaScript/JSX, C#, and XAML.
- **Noise-line filtering for new languages** — `isNoiseLine` import-directive regex extended with `from \w` (Python `from x import …`) and `use [\w:*{]` (Rust `use std::…`) alternatives so import statements in those languages are correctly suppressed.
- **Language labels for new languages** — `languageLabel()` in `util.ts` now maps `kotlin`, `dart`, and `swift` to human-readable names used in Copilot prompt hints (Java, Go, Rust, C, C++ were already mapped).
- **Test coverage for new languages** — import-noise and real-code test cases added to `codeLensProvider.test.ts` for all nine new languages.

---

## [0.2.2] — 2026-02-28

### Fixed

- **`explainFile` crashes mid-file** — replaced unbounded `Promise.allSettled` fan-out with a concurrency-limited runner (max 5 simultaneous requests) to avoid overwhelming the Copilot LM API on larger files.
- **Ghost text lost on tab switch** — `DecorationManager` now listens to `onDidChangeVisibleTextEditors` and re-applies stored decorations whenever the visible editor set changes, so explanations persist when switching away and back.

### Added

- **Automated test suite** using `@vscode/test-electron` and Mocha (`tdd` UI), runnable via `npm test`.
- **Unit tests for `util.ts`**: `contentHash` (hex format, determinism, key separation), `truncate` (boundary, ellipsis, whitespace collapse), `languageLabel` (all 13 known mappings + fallback).
- **Unit tests for `isNoiseLine`**: 35 cases covering blank lines, pure-punctuation, single-line comments (`//`, `#`, `--`, `%%`, `;`), block-comment lines, structural keywords, import/using/require/include directives, and XAML closing tags.
- **Unit tests for `isGeneratedFile`**: 16 cases covering all guarded extensions and normal files.
- **Integration tests for `SourceDocCodeLensProvider`**: generated-file guard, disabled state, all five modes, fixture-file lens count, `refresh()` event.
- **Integration tests for `DecorationManager`**: store/retrieve, multi-line independence, overwrite, `clearForEditor`, `clearAll`, and auto-clear on live document edit.
- **Mock-based tests for `ExplanationProvider`**: cache hit (model called once), separate code/language keys, `invalidateCache()`, no-model error message, `LanguageModelError` wrapping, pre-cancelled token, streamed chunk assembly.
- **Tests for `explainFile` command**: command registration, noise-line filtering, parallel execution via mocked `vscode.lm`, cancellation propagation, and error aggregation via `Promise.allSettled`.
- `src/test/fixtures/sample.ts` — controlled TypeScript fixture with functions, classes, interfaces, arrow functions, and noise lines.

---

## [0.2.1] — 2026-02-27

### Changed

- Split CI workflow into `ci.yml` (branch/PR builds) and `release.yml` (tag-triggered Marketplace publish) to fix publish job not triggering.
- Updated extension icon to a professional dark-card design with cyan highlighted code line and ghost-text tail.
- Added `scripts/gen-icon.js` to regenerate the icon without external dependencies.

---

## [0.2.0] — 2026-02-27

### Added

- **Explain file command** (`sourceDoc.explainFile`) — explains every non-noise line in the current file in parallel via `Promise.allSettled`, with a cancellable progress indicator showing `N / total done`.
- **`file` mode** — shows only the file-level `$(comment) Explain file` CodeLens at line 0; no per-line or per-block lenses.
- **`none` mode** — disables all CodeLens markers entirely.
- **Hover tooltip** — hovering over truncated inline ghost text shows the full explanation.
- **Generated-file guard** (`isGeneratedFile`) — skips CodeLens on `*.d.ts`, `*.g.cs`, `*.g.i.cs`, `*.generated.*`, `*.designer.cs`, `*.min.js/css/mjs`, `*.pb.go`, `assemblyinfo.cs`.
- **Noise line filtering** (`isNoiseLine`) — suppresses lenses on empty lines, pure-punctuation lines, comment lines, import/using directives, structural keywords (`try`/`finally`/`else`/`do`), and XAML closing tags.
- **Status bar icons** for new modes: `$(file)` for `file`, `$(circle-slash)` for `none`.

### Changed

- Toggle cycle extended: `block → line → both → file → none → block`.
- Copilot prompt tightened to 20 words max; responses now start with a verb and omit language name and "this code" boilerplate.
- `isNoiseLine` and `isGeneratedFile` exported from `codeLensProvider.ts` for reuse in `extension.ts`.

---

## [0.1.0] — 2026-02-27

### Added

- **CodeLens markers** on every function, class, and method (block mode) and every non-empty line (line mode), with a toggleable "both" mode.
- **GitHub Copilot integration** via the VS Code built-in `vscode.lm` API — no API key required.
- **Inline ghost text** decorations rendering Copilot explanations as italic comments (`after: { contentText }`) directly after the target line.
- **Regex fallback** for block detection when the language server hasn't loaded yet, with an automatic 2.5 s retry to upgrade to symbol-accurate lenses.
- **LRU cache** (200 entries, keyed by content hash) to avoid redundant Copilot requests.
- **Status bar item** showing current mode (`block` / `line` / `both`); click to cycle.
- **Commands**: `Explain Block`, `Explain Line`, `Toggle Mode`, `Clear All Explanations`, `Refresh CodeLenses`.
- **Configurable settings**: `sourceDoc.enabled`, `sourceDoc.mode`, `sourceDoc.languages`, `sourceDoc.modelFamily`, `sourceDoc.maxExplanationLength`.
- **Language support**: TypeScript, TSX, JavaScript, JSX, C#, XAML (default); any VS Code language ID via `sourceDoc.languages` setting.
- **XAML-specific block detection**: PascalCase element regex with up to 30-line context capture for richer Copilot prompts.
- **CI workflow** (GitHub Actions): compile + type-check on Ubuntu & Windows for every push and PR; VSIX packaging on pushes to `main`.
- `CONTRIBUTING.md` with setup guide, coding conventions, and instructions for adding new language support.

[Unreleased]: https://github.com/moonolgerd/source-doc/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/moonolgerd/source-doc/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/moonolgerd/source-doc/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/moonolgerd/source-doc/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/moonolgerd/source-doc/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/moonolgerd/source-doc/releases/tag/v0.1.0

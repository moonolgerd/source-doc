# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

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

[Unreleased]: https://github.com/source-doc/source-doc/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/source-doc/source-doc/releases/tag/v0.1.0

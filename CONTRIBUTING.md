# Contributing to Source Doc

Thank you for considering a contribution! This document covers everything you need to get the project running locally and submit a change.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Project Structure](#project-structure)
4. [Development Workflow](#development-workflow)
5. [Submitting a Pull Request](#submitting-a-pull-request)
6. [Coding Conventions](#coding-conventions)
7. [Adding a New Language](#adding-a-new-language)

---

## Code of Conduct

Be respectful, constructive, and inclusive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/).

---

## Getting Started

### Prerequisites

| Tool | Minimum version |
|---|---|
| Node.js | 20 |
| npm | 10 |
| VS Code | 1.90 |
| GitHub Copilot extension | any |

### Setup

```bash
git clone https://github.com/source-doc/source-doc.git
cd source-doc
npm install
```

Then press **F5** in VS Code (or run `npm run watch` and press F5) to open the **Extension Development Host** with the extension loaded.

---

## Project Structure

```
source-doc/
├── .github/workflows/ci.yml   # CI — build, type-check, package
├── .vscode/
│   ├── launch.json            # F5 debug config
│   └── tasks.json             # Default watch/build task
├── src/
│   ├── extension.ts           # activate() / deactivate(), command wiring
│   ├── codeLensProvider.ts    # CodeLensProvider (block + line modes)
│   ├── explanationProvider.ts # vscode.lm / GitHub Copilot integration + LRU cache
│   ├── decorationManager.ts   # Inline ghost-text decorations
│   ├── statusBar.ts           # Status bar item showing current mode
│   └── util.ts                # contentHash, truncate, languageLabel helpers
├── out/                       # Compiled JS — generated, do not edit
├── package.json               # Extension manifest and npm scripts
├── tsconfig.json
└── README.md
```

---

## Development Workflow

### Compile once

```bash
npm run compile
```

### Compile in watch mode (recommended while developing)

```bash
npm run watch
```

### Type-check without emitting files

```bash
npx tsc --noEmit
```

### Launch the extension

Press **F5** in VS Code. This opens a second VS Code window (the Extension Development Host) with the extension active. Changes compiled by the watch task are picked up automatically — use **Developer: Reload Window** in the host window to reload.

### Build the VSIX package locally

```bash
npm install -g @vscode/vsce
vsce package --no-dependencies
```

---

## Submitting a Pull Request

1. **Fork** the repository and create a branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```
2. Make your changes; make sure `npx tsc --noEmit` exits with no errors.
3. Commit using a clear, imperative message:
   ```
   feat: add Python block detection
   fix: handle empty XAML files gracefully
   docs: update README settings table
   ```
   We loosely follow [Conventional Commits](https://www.conventionalcommits.org/).
4. Push and open a PR against `main`. Fill in the PR template context:
   - What problem does this solve?
   - How was it tested?
   - Any breaking changes?
5. CI must pass before merge. A maintainer will review within a few days.

---

## Coding Conventions

- **TypeScript strict mode** is enabled — no implicit `any`, no non-null unsafe access without a comment justifying it.
- Use `const` by default; `let` only when reassignment is necessary.
- Prefer `async/await` over raw Promise chains.
- All public classes must implement `vscode.Disposable` and push child disposables into a local `disposables` array.
- Read `vscode.workspace.getConfiguration('sourceDoc')` at call time, never cache it at construction time — this ensures settings changes are always reflected.
- Keep each file focused on a single responsibility (see [Project Structure](#project-structure)).
- No external runtime dependencies — VS Code's built-in APIs and Node.js stdlib only.

---

## Adding a New Language

1. **`package.json`** — add `"onLanguage:<id>"` to `activationEvents` and `"<id>"` to the `sourceDoc.languages` default array.
2. **`src/util.ts`** — add a human-readable label to the `labels` map in `languageLabel()`.
3. **`src/codeLensProvider.ts`** — if the language doesn't have a VS Code language server that exposes document symbols, extend `regexBlockLenses()`:
   - Check `document.languageId` and build a language-specific regex matching declaration lines.
   - Optionally gather multi-line context (see the XAML implementation as a reference).
4. Open a file of the new language in the Extension Development Host and verify lenses appear.

# Investigation: Extension Throws Error During Analysis

## Summary

This document captures all potential root causes identified in the source code
that can lead to a visible error (or a silent failure) when the user triggers
any of the **Explain** commands (`Explain Line`, `Explain Block`,
`Explain File`).

---

## 1. `ExplanationProvider.explain` — unguarded `LanguageModelError` codes
**File:** `src/explanationProvider.ts`

```ts
} catch (err) {
    if (err instanceof vscode.LanguageModelError) {
        throw new Error(`Copilot error (${err.code}): ${err.message}`);
    }
    throw err;
}
```

### Issue
`vscode.LanguageModelError` carries typed `code` values
(`NoPermissions`, `Blocked`, `NotFound`, `RequestFailed`, …). The current
handler re-throws them all with the same generic message, so the user sees
cryptic strings like `Copilot error (NoPermissions): …` with no actionable
guidance.

Additionally, if the model stream throws a plain `Error` (e.g. a network
timeout), it propagates up uncaught to `runExplain`, which shows it in the
status bar, but **the LRU cache is not written** — meaning every retry hits
the model again instead of surfacing a friendlier retry prompt.

### Suggested fix
Map each `LanguageModelError.code` to a human-readable message and offer
retry / re-auth guidance.

---

## 2. `ExplanationProvider.explain` — empty `result` stored in cache
**File:** `src/explanationProvider.ts`

```ts
let result = '';
try {
    const response = await model.sendRequest([prompt], {}, token);
    for await (const chunk of response.text) {
        if (token.isCancellationRequested) { break; }
        result += chunk;
    }
} catch (err) { … }

result = result.trim();
this.addToCache(key, result);   // ← stored even when result === ''
return result;
```

### Issue
When the model returns an empty body (e.g. content-filtered, quota exhausted,
or the token was cancelled mid-stream), `result` is `''` after `.trim()`.
That empty string is written into the LRU cache and subsequently rendered as
an invisible ghost-text decoration. The next identical request returns `''`
from cache without ever hitting the model again, making it look like the
feature is broken for that code snippet.

### Suggested fix
```ts
result = result.trim();
if (!result) {
    throw new Error('Copilot returned an empty explanation. Please try again.');
}
this.addToCache(key, result);
return result;
```

---

## 3. `codeLensProvider.ts` — double semicolon (typo / syntax smell)
**File:** `src/codeLensProvider.ts`, `regexBlockLenses`

```ts
const RE = isXml ? XAML_RE : CODE_RE;;   // ← double semicolon
```

### Issue
While not a runtime error in TypeScript/JavaScript, this is a clear typo that
may confuse linters (`no-extra-semi`) and obscure any future edits on that
line. Should be removed.

---

## 4. `codeLensProvider.ts` — `isNoiseLine` comment-detection misses `//` mid-regex
**File:** `src/codeLensProvider.ts`, `isNoiseLine`

```ts
if (/^(\\/\\/|#|--|%%|;)/.test(trimmed)) { return true; }
```

### Issue
The pattern correctly identifies single-line comments *at the start of a
trimmed line*. However, import/use-statement guard placed **after** this check
can still let through lines that begin with a comment prefix from some
languages not listed (e.g. Lua `--`, Haskell `--`). These are unlikely to be
active languages today but the `sourceDoc.languages` config is user-editable,
so arbitrary language IDs can be added.

---

## 5. `extension.ts` — `languageRegistrations` never pushed to `context.subscriptions`
**File:** `src/extension.ts`

```ts
let languageRegistrations: vscode.Disposable[] = [];
context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('sourceDoc.languages')) {
            languageRegistrations.forEach(d => d.dispose());
            languageRegistrations = [];
            registerCodeLensProviders(context, codeLensProvider, languageRegistrations);
        }
    }),
);
```

### Issue
`registerCodeLensProviders` pushes the new `CodeLensProvider` registrations
into the local `languageRegistrations` array (correctly). However, that array
is **never added to `context.subscriptions`**. If the extension is deactivated
between two configuration-change events, the registrations accumulated in that
array will **not** be disposed. This leaks the provider registrations.

The first call to `registerCodeLensProviders` (outside the listener) correctly
passes `context.subscriptions` as the default, so only the _dynamic_
re-registration path is affected.

### Suggested fix
```ts
registerCodeLensProviders(context, codeLensProvider, languageRegistrations);
// After re-registration, track new disposables:
languageRegistrations.forEach(d => context.subscriptions.push(d));
```
Or simply push the `languageRegistrations` array reference once so VS Code
drains it on deactivation.

---

## 6. `extension.ts` — `explainFile` does not guard against zero non-noise lines
**File:** `src/extension.ts`, `sourceDoc.explainFile` command handler

```ts
const results = await runWithConcurrency(lines, 5, async ({ line, code }) => { … });
```

### Issue
`runWithConcurrency` is called with `Math.min(limit, items.length)` workers.
When `lines` is empty (e.g. a file that consists entirely of comments or
blank lines), `items.length === 0`, which causes
`Array.from({ length: 0 }, worker)` — effectively a no-op. The progress
notification is shown and dismissed with `"0 / 0 done"` which is confusing.

### Suggested fix
Add an early exit and informational message:
```ts
if (lines.length === 0) {
    vscode.window.showInformationMessage('Source Doc: nothing to explain in this file.');
    return;
}
```

---

## 7. `codeLensProvider.ts` — `provideCodeLenses` accesses `document.lineAt(0)` without checking `lineCount`
**File:** `src/codeLensProvider.ts`, `provideCodeLenses`

```ts
const firstRange = new vscode.Range(0, 0, 0, document.lineAt(0).text.length);
```

### Issue
If an empty file is opened (`lineCount === 0`), calling `document.lineAt(0)`
throws a `RangeError`. VS Code normally guarantees at least one line, but
virtual/untitled documents and some language servers surface edge cases.

### Suggested fix
```ts
const firstRange = document.lineCount > 0
    ? new vscode.Range(0, 0, 0, document.lineAt(0).text.length)
    : new vscode.Range(0, 0, 0, 0);
```

---

## Priority Matrix

| # | File | Severity | Type |
|---|------|----------|------|
| 2 | `explanationProvider.ts` | 🔴 High | Empty response cached → silent broken state |
| 1 | `explanationProvider.ts` | 🟠 Medium | Poor error messaging for LM errors |
| 5 | `extension.ts` | 🟠 Medium | Disposable leak on config change |
| 7 | `codeLensProvider.ts` | 🟠 Medium | Potential `RangeError` on empty file |
| 6 | `extension.ts` | 🟡 Low | Confusing UX on all-comment files |
| 4 | `codeLensProvider.ts` | 🟡 Low | Noise-filter gap for user-added languages |
| 3 | `codeLensProvider.ts` | ⚪ Trivial | Double semicolon typo |

---

## Reproduction Steps (items 1 & 2)

1. Open a TypeScript/JavaScript file.
2. Ensure GitHub Copilot is installed but temporarily sign out (or exhaust the
   free-tier quota).
3. Click any **Explain** CodeLens.
4. Observe: an error notification appears with a raw `LanguageModelError` code.
5. Sign back in and click the same lens — **no explanation appears** because
   the empty string was already cached from step 4.

---

*Investigation authored via automated static analysis of
[moonolgerd/source-doc](https://github.com/moonolgerd/source-doc) — `main`
branch @ `15e0c2f`.*

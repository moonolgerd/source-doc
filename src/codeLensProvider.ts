import * as vscode from 'vscode';
import * as path from 'path';

export type ExplainMode = 'line' | 'block' | 'both' | 'file' | 'none';

/**
 * Returns true for auto-generated files that should be skipped entirely.
 * Patterns: *.d.ts, *.g.cs, *.g.i.cs, *.generated.*, *.designer.cs, *.min.js, *.min.css
 */
export function isGeneratedFile(document: vscode.TextDocument): boolean {
    const fsPath = document.uri.fsPath;
    const base = path.basename(fsPath).toLowerCase();
    return (
        /\.d\.ts$/.test(base) ||
        /\.g\.cs$/.test(base) ||
        /\.g\.i\.cs$/.test(base) ||
        /\.generated\./.test(base) ||
        /\.designer\.cs$/.test(base) ||
        /\.min\.(js|css|mjs)$/.test(base) ||
        /\.pb\.go$/.test(base) ||
        base === 'assemblyinfo.cs'
    );
}

/**
 * Returns true for lines that don't merit an Explain lens.
 * Extracted so extension.ts can reuse it for the explainFile command.
 */
export function isNoiseLine(trimmed: string, languageId: string): boolean {
    if (trimmed.length === 0) { return true; }
    if (/^[^a-zA-Z0-9_$]+$/.test(trimmed)) { return true; }
    if (/^(\/\/|#|--|%%|;)/.test(trimmed)) { return true; }
    if (/^\/\*|^\*[\s/]|^\*$/.test(trimmed)) { return true; }
    if (/^(try|finally|else|do)\s*\{?\s*$/.test(trimmed)) { return true; }
    if (/^(import\s|export\s+\*|from\s+'|from\s+"|require\s*\(|using\s+[\w.]+;|#include\s*[<"])/.test(trimmed)) { return true; }
    if (languageId === 'xaml' || languageId === 'xml') {
        if (trimmed.startsWith('</') || trimmed.startsWith('<!--')) { return true; }
    }
    return false;
}

/**
 * Provides CodeLens markers for the Source Doc extension.
 *
 * - block mode: one lens per function / class / method (via document symbols)
 * - line mode:  one lens per non-empty line
 * - both:       line + block lenses combined
 */
export class SourceDocCodeLensProvider implements vscode.CodeLensProvider {
    private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
    readonly onDidChangeCodeLenses: vscode.Event<void> =
        this._onDidChangeCodeLenses.event;

    /** Track pending retry timers to avoid stacking them */
    private retryTimer: ReturnType<typeof setTimeout> | undefined;

    private disposables: vscode.Disposable[] = [];

    constructor() {
        // Refresh lenses whenever the relevant settings change
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (
                    e.affectsConfiguration('sourceDoc.enabled') ||
                    e.affectsConfiguration('sourceDoc.mode')
                ) {
                    this._onDidChangeCodeLenses.fire();
                }
            }),
        );
    }

    async provideCodeLenses(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken,
    ): Promise<vscode.CodeLens[]> {
        const config = vscode.workspace.getConfiguration('sourceDoc');
        if (!config.get<boolean>('enabled', true)) {
            return [];
        }

        if (isGeneratedFile(document)) {
            return [];
        }

        const mode = config.get<ExplainMode>('mode', 'block');

        // 'none' — no lenses at all
        if (mode === 'none') {
            return [];
        }

        const lenses: vscode.CodeLens[] = [];
        const firstRange = new vscode.Range(0, 0, 0, document.lineAt(0).text.length);

        // File-level lens at line 0 — always shown (except 'none')
        lenses.push(
            new vscode.CodeLens(firstRange, {
                title: '$(comment) Explain file',
                command: 'sourceDoc.explainFile',
                tooltip: 'Explain every line in this file with Copilot',
                arguments: [
                    {
                        uri: document.uri,
                        languageId: document.languageId,
                    },
                ],
            }),
        );

        // 'file' mode — only the file-level lens, no per-line/per-block lenses
        if (mode !== 'file') {
            if (mode === 'block' || mode === 'both') {
                lenses.push(...(await this.blockLenses(document)));
            }
            if (mode === 'line' || mode === 'both') {
                lenses.push(...this.lineLenses(document));
            }
        }

        return lenses;
    }

    /** Force a full refresh of all CodeLenses. */
    refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }

    dispose(): void {
        if (this.retryTimer !== undefined) {
            clearTimeout(this.retryTimer);
        }
        this._onDidChangeCodeLenses.dispose();
        this.disposables.forEach(d => d.dispose());
    }

    // ─── private ────────────────────────────────────────────────────────────

    private async blockLenses(
        document: vscode.TextDocument,
    ): Promise<vscode.CodeLens[]> {
        let symbols: vscode.DocumentSymbol[];
        try {
            const raw = await vscode.commands.executeCommand<
                vscode.DocumentSymbol[]
            >('vscode.executeDocumentSymbolProvider', document.uri);
            symbols = raw ?? [];
        } catch {
            symbols = [];
        }

        // If the language server hasn't loaded yet, schedule a retry so lenses
        // appear once symbols become available, and fall back to regex detection.
        if (symbols.length === 0) {
            this.scheduleRetry();
            return this.regexBlockLenses(document);
        }

        const lenses: vscode.CodeLens[] = [];
        this.collectSymbolLenses(symbols, document, lenses);
        return lenses;
    }

    /** Schedule a single delayed refresh (debounced). */
    private scheduleRetry(): void {
        if (this.retryTimer !== undefined) {
            return;
        }
        this.retryTimer = setTimeout(() => {
            this.retryTimer = undefined;
            this._onDidChangeCodeLenses.fire();
        }, 2500);
    }

    /**
     * Regex-based block detection as a fast fallback when the language
     * server hasn't provided symbols yet. Catches the most common patterns
     * across TypeScript/TSX, JavaScript, C#, Python, Java, Go, Rust, XAML, etc.
     */
    private regexBlockLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const isXml = document.languageId === 'xaml' || document.languageId === 'xml';

        // For XAML/XML: match opening tags of PascalCase elements (components, templates, styles).
        // Excludes closing tags, processing instructions, and comments.
        const XAML_RE = /^[ \t]*<([A-Z][A-Za-z0-9.]*)(?:[\s>]|\/>)/;

        // For code languages: match function/class/method/def/fn declarations.
        const CODE_RE = /^[ \t]*((?:export\s+)?(?:default\s+)?(?:async\s+)?function[\s*]+\w+|(?:export\s+)?(?:abstract\s+|sealed\s+)?class\s+\w+|(?:export\s+)?(?:abstract\s+)?interface\s+\w+|(?:export\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>|(?:public|private|protected|internal)(?:\s+(?:static|override|virtual|abstract|async|readonly))*\s+\S+\s+\w+\s*[({]|def\s+\w+\s*\(|fn\s+\w+\s*[(<]|func\s+\w+\s*[(<])/;

        const RE = isXml ? XAML_RE : CODE_RE;;

        // In block mode, pass the full element/function text as context.
        // For XAML, capture from the opening tag to the matching close or end-of-line.
        const lenses: vscode.CodeLens[] = [];
        for (let i = 0; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;
            if (!RE.test(lineText)) {
                continue;
            }

            // For XAML, gather the full element span (until the matching closing tag
            // or self-close) to give Copilot richer context — capped at 30 lines.
            let code = lineText.trim();
            if (isXml) {
                const selfClose = lineText.trimEnd().endsWith('/>');
                if (!selfClose) {
                    const lines: string[] = [lineText];
                    for (let j = i + 1; j < document.lineCount && j < i + 30; j++) {
                        const l = document.lineAt(j).text;
                        lines.push(l);
                        if (l.includes('</') || l.trimEnd().endsWith('/>')) {
                            break;
                        }
                    }
                    code = lines.join('\n').trim();
                }
            }
            const range = new vscode.Range(i, 0, i, lineText.length);
            lenses.push(
                new vscode.CodeLens(range, {
                    title: '$(comment) Explain block',
                    command: 'sourceDoc.explainBlock',
                    tooltip: 'Explain this code block with Copilot',
                    arguments: [
                        {
                            uri: document.uri,
                            range: null,
                            line: i,
                            code: code,
                            languageId: document.languageId,
                        },
                    ],
                }),
            );
        }
        return lenses;
    }

    private collectSymbolLenses(
        symbols: vscode.DocumentSymbol[],
        document: vscode.TextDocument,
        lenses: vscode.CodeLens[],
    ): void {
        const interestingKinds = new Set([
            vscode.SymbolKind.Function,
            vscode.SymbolKind.Method,
            vscode.SymbolKind.Class,
            vscode.SymbolKind.Interface,
            vscode.SymbolKind.Constructor,
            vscode.SymbolKind.Property,
            vscode.SymbolKind.Enum,
            vscode.SymbolKind.Module,
            vscode.SymbolKind.Struct,
        ]);

        for (const sym of symbols) {
            if (interestingKinds.has(sym.kind)) {
                const firstLine = sym.range.start.line;
                const lineText = document.lineAt(firstLine).text;
                // Skip if the symbol's first line is noise (e.g. a lone `{`)
                if (this.isNoiseLine(lineText.trim(), document.languageId)) {
                    if (sym.children?.length) {
                        this.collectSymbolLenses(sym.children, document, lenses);
                    }
                    continue;
                }
                const range = new vscode.Range(
                    firstLine, 0,
                    firstLine, lineText.length,
                );
                const codeText = document.getText(sym.range);
                lenses.push(
                    new vscode.CodeLens(range, {
                        title: '$(comment) Explain block',
                        command: 'sourceDoc.explainBlock',
                        tooltip: 'Explain this code block with Copilot',
                        arguments: [
                            {
                                uri: document.uri,
                                range: sym.range,
                                line: firstLine,
                                code: codeText,
                                languageId: document.languageId,
                            },
                        ],
                    }),
                );
            }
            // Recurse into children
            if (sym.children?.length) {
                this.collectSymbolLenses(sym.children, document, lenses);
            }
        }
    }

    private lineLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const lenses: vscode.CodeLens[] = [];
        for (let i = 0; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;
            const trimmed = lineText.trim();
            if (this.isNoiseLine(trimmed, document.languageId)) {
                continue;
            }
            const range = new vscode.Range(i, 0, i, lineText.length);
            lenses.push(
                new vscode.CodeLens(range, {
                    title: '$(comment) Explain line',
                    command: 'sourceDoc.explainLine',
                    tooltip: 'Explain this line with Copilot',
                    arguments: [
                        {
                            uri: document.uri,
                            line: i,
                            code: trimmed,
                            languageId: document.languageId,
                        },
                    ],
                }),
            );
        }
        return lenses;
    }

    /** Delegate to the exported top-level function so it can be reused externally. */
    private isNoiseLine(trimmed: string, languageId: string): boolean {
        return isNoiseLine(trimmed, languageId);
    }
}

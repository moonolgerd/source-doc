import * as vscode from 'vscode';
import { SourceDocCodeLensProvider, ExplainMode, isNoiseLine, isGeneratedFile } from './codeLensProvider';
import { ExplanationProvider } from './explanationProvider';
import { DecorationManager } from './decorationManager';
import { SourceDocStatusBar } from './statusBar';

/** Context argument passed from CodeLens commands. */
interface ExplainArgs {
    uri: vscode.Uri;
    line: number;
    code: string;
    languageId: string;
    /** Only present for explainBlock; null when using regex fallback */
    range?: vscode.Range | null;
}

const MODE_CYCLE: ExplainMode[] = ['block', 'line', 'both', 'file', 'none'];

export function activate(context: vscode.ExtensionContext): void {
    const explanationProvider = new ExplanationProvider();
    const decorationManager   = new DecorationManager();
    const statusBar           = new SourceDocStatusBar();
    const codeLensProvider    = new SourceDocCodeLensProvider();

    context.subscriptions.push(
        explanationProvider,
        decorationManager,
        statusBar,
        codeLensProvider,
    );

    // ── Register CodeLens provider for each configured language ──────────────
    registerCodeLensProviders(context, codeLensProvider);

    // Refresh lenses when the user switches to a different editor tab
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => {
            codeLensProvider.refresh();
        }),
        vscode.workspace.onDidOpenTextDocument(() => {
            codeLensProvider.refresh();
        }),
    );

    // Re-register providers when sourceDoc.languages changes
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

    // ── Hover provider – shows full explanation when the ghost text is cut off ──
    // Registered for all languages; returns early when no explanation stored.
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(
            { scheme: 'file' },
            {
                provideHover(document, position) {
                    const full = decorationManager.getFullExplanation(
                        document.uri.toString(),
                        position.line,
                    );
                    if (!full) { return; }
                    const maxLength =
                        vscode.workspace
                            .getConfiguration('sourceDoc')
                            .get<number>('maxExplanationLength') ?? 160;
                    // Only show hover when the text was actually truncated
                    if (full.length <= maxLength) { return; }
                    const md = new vscode.MarkdownString(`**Source Doc**\n\n${full}`, true);
                    return new vscode.Hover(md);
                },
            },
        ),
    );

    // ── Commands ─────────────────────────────────────────────────────────────

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'sourceDoc.explainLine',
            async (args: ExplainArgs) => {
                await runExplain(args, decorationManager, explanationProvider);
            },
        ),

        vscode.commands.registerCommand(
            'sourceDoc.explainBlock',
            async (args: ExplainArgs) => {
                await runExplain(args, decorationManager, explanationProvider);
            },
        ),

        vscode.commands.registerCommand('sourceDoc.toggleMode', async () => {
            const config = vscode.workspace.getConfiguration('sourceDoc');
            const current = config.get<ExplainMode>('mode', 'block');
            const idx = MODE_CYCLE.indexOf(current);
            const next = MODE_CYCLE[(idx + 1) % MODE_CYCLE.length];
            await config.update('mode', next, vscode.ConfigurationTarget.Global);
            statusBar.update();
            vscode.window.setStatusBarMessage(`Source Doc mode: ${next}`, 3000);
        }),

        vscode.commands.registerCommand('sourceDoc.clearExplanations', () => {
            decorationManager.clearAll();
            vscode.window.setStatusBarMessage('Source Doc: explanations cleared', 2000);
        }),

        vscode.commands.registerCommand('sourceDoc.refreshLenses', () => {
            codeLensProvider.refresh();
            vscode.window.setStatusBarMessage('Source Doc: CodeLenses refreshed', 2000);
        }),

        vscode.commands.registerCommand(
            'sourceDoc.explainFile',
            async (args: { uri: vscode.Uri; languageId: string }) => {
                const uri: vscode.Uri =
                    args.uri instanceof vscode.Uri
                        ? args.uri
                        : vscode.Uri.from(args.uri as unknown as { scheme: string; path: string });

                const editor =
                    vscode.window.visibleTextEditors.find(
                        e => e.document.uri.toString() === uri.toString(),
                    ) ?? vscode.window.activeTextEditor;

                if (!editor) {
                    vscode.window.showWarningMessage('Source Doc: no active editor found.');
                    return;
                }

                if (isGeneratedFile(editor.document)) {
                    vscode.window.showWarningMessage('Source Doc: generated files are skipped.');
                    return;
                }

                const config    = vscode.workspace.getConfiguration('sourceDoc');
                const maxLength = config.get<number>('maxExplanationLength') ?? 160;
                const doc = editor.document;

                // Collect all non-noise lines
                const lines: Array<{ line: number; code: string }> = [];
                for (let i = 0; i < doc.lineCount; i++) {
                    const text = doc.lineAt(i).text;
                    const trimmed = text.trim();
                    if (!isNoiseLine(trimmed, doc.languageId)) {
                        lines.push({ line: i, code: trimmed });
                    }
                }

                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Window,
                        title: `Source Doc: explaining ${lines.length} lines…`,
                        cancellable: true,
                    },
                    async (progress, token) => {
                        let done = 0;
                        const results = await Promise.allSettled(
                            lines.map(async ({ line, code }) => {
                                if (token.isCancellationRequested) { return; }
                                const explanation = await explanationProvider.explain(
                                    code,
                                    doc.languageId,
                                    token,
                                );
                                if (!token.isCancellationRequested) {
                                    decorationManager.setExplanation(editor, line, explanation, maxLength);
                                }
                                done++;
                                progress.report({ message: `${done} / ${lines.length} done` });
                            }),
                        );
                        const errors = results
                            .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
                            .map(r => (r.reason instanceof Error ? r.reason.message : String(r.reason)));
                        if (errors.length) {
                            vscode.window.showErrorMessage(
                                `Source Doc: ${errors.length} line(s) failed — ${errors[0]}`,
                            );
                        }
                    },
                );
            },
        ),
    );
}

export function deactivate(): void {
    // All disposables are cleaned up via context.subscriptions
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function registerCodeLensProviders(
    context: vscode.ExtensionContext,
    provider: SourceDocCodeLensProvider,
    into: vscode.Disposable[] = context.subscriptions as unknown as vscode.Disposable[],
): void {
    const config = vscode.workspace.getConfiguration('sourceDoc');
    const languages = config.get<string[]>('languages') ?? [
        'typescript',
        'typescriptreact',
        'javascript',
        'javascriptreact',
        'csharp',
        'xaml',
    ];
    for (const lang of languages) {
        into.push(
            vscode.languages.registerCodeLensProvider(
                { scheme: 'file', language: lang },
                provider,
            ),
        );
    }
}

async function runExplain(
    args: ExplainArgs,
    decorationManager: DecorationManager,
    explanationProvider: ExplanationProvider,
): Promise<void> {
    // Reconstruct vscode.Uri — command arguments are JSON-serialized
    const uri: vscode.Uri =
        args.uri instanceof vscode.Uri
            ? args.uri
            : vscode.Uri.from(args.uri as unknown as { scheme: string; path: string });

    const editor =
        vscode.window.visibleTextEditors.find(
            e => e.document.uri.toString() === uri.toString(),
        ) ?? vscode.window.activeTextEditor;

    if (!editor) {
        vscode.window.showWarningMessage('Source Doc: no active editor found.');
        return;
    }

    const config    = vscode.workspace.getConfiguration('sourceDoc');
    const maxLength = config.get<number>('maxExplanationLength') ?? 160;

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Window,
            title: 'Source Doc: explaining…',
            cancellable: true,
        },
        async (_progress, token) => {
            try {
                const explanation = await explanationProvider.explain(
                    args.code,
                    args.languageId,
                    token,
                );
                if (!token.isCancellationRequested) {
                    decorationManager.setExplanation(
                        editor,
                        args.line,
                        explanation,
                        maxLength,
                    );
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`Source Doc: ${msg}`);
            }
        },
    );
}

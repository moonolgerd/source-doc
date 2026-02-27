import * as vscode from 'vscode';
import { SourceDocCodeLensProvider, ExplainMode } from './codeLensProvider';
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

const MODE_CYCLE: ExplainMode[] = ['block', 'line', 'both'];

export function activate(context: vscode.ExtensionContext): void {
    const explanationProvider = new ExplanationProvider();
    const decorationManager = new DecorationManager();
    const statusBar = new SourceDocStatusBar();
    const codeLensProvider = new SourceDocCodeLensProvider();

    context.subscriptions.push(
        explanationProvider,
        decorationManager,
        statusBar,
        codeLensProvider,
    );

    // ── Register CodeLens provider for each configured language ──────────────
    registerCodeLensProviders(context, codeLensProvider);

    // Refresh lenses when the user switches to a different editor tab,
    // so newly opened files get lenses without needing to edit the file.
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => {
            codeLensProvider.refresh();
        }),
        vscode.workspace.onDidOpenTextDocument(() => {
            codeLensProvider.refresh();
        }),
    );

    // Re-register when sourceDoc.languages changes
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
            await config.update(
                'mode',
                next,
                vscode.ConfigurationTarget.Global,
            );
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
        const d = vscode.languages.registerCodeLensProvider(
            { scheme: 'file', language: lang },
            provider,
        );
        into.push(d);
    }
}

async function runExplain(
    args: ExplainArgs,
    decorationManager: DecorationManager,
    explanationProvider: ExplanationProvider,
): Promise<void> {
    // Reconstruct vscode.Uri — command arguments are JSON-serialized
    // so args.uri may be a plain object rather than a vscode.Uri instance.
    const uri: vscode.Uri =
        args.uri instanceof vscode.Uri
            ? args.uri
            : vscode.Uri.from(args.uri as unknown as { scheme: string; path: string });

    // Find the active text editor for the given document URI
    const editor = vscode.window.visibleTextEditors.find(
        e => e.document.uri.toString() === uri.toString(),
    ) ?? vscode.window.activeTextEditor;

    if (!editor) {
        vscode.window.showWarningMessage('Source Doc: no active editor found.');
        return;
    }

    const config = vscode.workspace.getConfiguration('sourceDoc');
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
                const msg =
                    err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`Source Doc: ${msg}`);
            }
        },
    );
}

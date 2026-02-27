import * as vscode from 'vscode';
import { truncate } from './util';

/**
 * Manages inline ghost-text decorations that show code explanations
 * as italic text after the relevant line.
 */
export class DecorationManager implements vscode.Disposable {
    private readonly decorationType: vscode.TextEditorDecorationType;

    /** Map from editor URI string → (line number → explanation text) */
    private readonly explanations = new Map<string, Map<number, string>>();

    private readonly disposables: vscode.Disposable[] = [];

    constructor() {
        this.decorationType = vscode.window.createTextEditorDecorationType({
            after: {
                color: new vscode.ThemeColor('editorCodeLens.foreground'),
                fontStyle: 'italic',
                margin: '0 0 0 2em',
            },
            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
        });

        // Clear stale decorations when a document changes
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(e => {
                this.clearForUri(e.document.uri.toString());
            }),
            vscode.workspace.onDidCloseTextDocument(doc => {
                this.clearForUri(doc.uri.toString());
            }),
        );
    }

    /**
     * Set an explanation for a specific line in an editor.
     * Re-applies ALL decorations for that editor so VS Code shows the full set.
     */
    setExplanation(
        editor: vscode.TextEditor,
        line: number,
        text: string,
        maxLength: number,
    ): void {
        const key = editor.document.uri.toString();
        if (!this.explanations.has(key)) {
            this.explanations.set(key, new Map());
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.explanations.get(key)!.set(line, truncate(text, maxLength));
        this.applyDecorations(editor);
    }

    /**
     * Remove all explanations for the given editor.
     */
    clearForEditor(editor: vscode.TextEditor): void {
        this.clearForUri(editor.document.uri.toString());
        editor.setDecorations(this.decorationType, []);
    }

    /**
     * Remove all explanations across all editors.
     */
    clearAll(): void {
        this.explanations.clear();
        for (const editor of vscode.window.visibleTextEditors) {
            editor.setDecorations(this.decorationType, []);
        }
    }

    // ─── private ────────────────────────────────────────────────────────────

    private clearForUri(uriString: string): void {
        if (this.explanations.has(uriString)) {
            this.explanations.delete(uriString);
            const editor = vscode.window.visibleTextEditors.find(
                e => e.document.uri.toString() === uriString,
            );
            if (editor) {
                editor.setDecorations(this.decorationType, []);
            }
        }
    }

    private applyDecorations(editor: vscode.TextEditor): void {
        const key = editor.document.uri.toString();
        const lineMap = this.explanations.get(key);
        if (!lineMap || lineMap.size === 0) {
            editor.setDecorations(this.decorationType, []);
            return;
        }

        const options: vscode.DecorationOptions[] = [];
        for (const [line, text] of lineMap) {
            if (line >= editor.document.lineCount) {
                continue;
            }
            const lineText = editor.document.lineAt(line).text;
            const endChar = lineText.length;
            const range = new vscode.Range(line, endChar, line, endChar);
            options.push({
                range,
                renderOptions: {
                    after: { contentText: `  // ${text}` },
                },
            });
        }
        editor.setDecorations(this.decorationType, options);
    }

    dispose(): void {
        this.decorationType.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}

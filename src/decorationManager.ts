import * as vscode from 'vscode';
import { truncate } from './util';

/**
 * Manages inline ghost-text decorations that show code explanations
 * as italic text after the relevant line, plus stores full text for hover.
 */
export class DecorationManager implements vscode.Disposable {
    private readonly decorationType: vscode.TextEditorDecorationType;

    /** uri → (line → truncated display text) */
    private readonly displayMap = new Map<string, Map<number, string>>();
    /** uri → (line → full untruncated text, for hover) */
    private readonly fullMap = new Map<string, Map<number, string>>();

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

        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(e => {
                this.clearForUri(e.document.uri.toString());
            }),
            vscode.workspace.onDidCloseTextDocument(doc => {
                this.clearForUri(doc.uri.toString());
            }),
            vscode.window.onDidChangeVisibleTextEditors(editors => {
                for (const editor of editors) {
                    this.applyDecorations(editor);
                }
            }),
        );
    }

    /**
     * Store an explanation for a line and render it as inline ghost text.
     * The full text is kept separately so a hover provider can show it uncut.
     */
    setExplanation(
        editor: vscode.TextEditor,
        line: number,
        fullText: string,
        maxLength: number,
    ): void {
        const key = editor.document.uri.toString();

        if (!this.displayMap.has(key)) { this.displayMap.set(key, new Map()); }
        if (!this.fullMap.has(key))    { this.fullMap.set(key, new Map()); }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.displayMap.get(key)!.set(line, truncate(fullText, maxLength));
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.fullMap.get(key)!.set(line, fullText);

        this.applyDecorations(editor);
    }

    /**
     * Return the full (untruncated) explanation for a given URI + line,
     * or undefined if none is stored. Used by the hover provider.
     */
    getFullExplanation(uriString: string, line: number): string | undefined {
        return this.fullMap.get(uriString)?.get(line);
    }

    clearForEditor(editor: vscode.TextEditor): void {
        this.clearForUri(editor.document.uri.toString());
        editor.setDecorations(this.decorationType, []);
    }

    clearAll(): void {
        this.displayMap.clear();
        this.fullMap.clear();
        for (const editor of vscode.window.visibleTextEditors) {
            editor.setDecorations(this.decorationType, []);
        }
    }

    // ─── private ────────────────────────────────────────────────────────────

    private clearForUri(uriString: string): void {
        if (this.displayMap.has(uriString)) {
            this.displayMap.delete(uriString);
            this.fullMap.delete(uriString);
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
        const lineMap = this.displayMap.get(key);
        if (!lineMap || lineMap.size === 0) {
            editor.setDecorations(this.decorationType, []);
            return;
        }

        const options: vscode.DecorationOptions[] = [];
        for (const [line, text] of lineMap) {
            if (line >= editor.document.lineCount) { continue; }
            const endChar = editor.document.lineAt(line).text.length;
            const full = this.fullMap.get(key)?.get(line);
            const isTruncated = full !== undefined && full !== text;
            options.push({
                range: new vscode.Range(line, endChar, line, endChar),
                hoverMessage: isTruncated
                    ? new vscode.MarkdownString(`**Source Doc**\n\n${full}`)
                    : undefined,
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

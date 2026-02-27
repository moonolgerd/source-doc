import * as assert from 'assert';
import * as vscode from 'vscode';
import { DecorationManager } from '../../decorationManager';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Open a temporary in-memory document and show it in an editor. */
async function openTempEditor(content: string): Promise<vscode.TextEditor> {
    const doc = await vscode.workspace.openTextDocument({
        language: 'typescript',
        content,
    });
    return vscode.window.showTextDocument(doc, { preserveFocus: true });
}

// ── DecorationManager ─────────────────────────────────────────────────────────

suite('DecorationManager', () => {
    let manager: DecorationManager;

    setup(() => {
        manager = new DecorationManager();
    });

    teardown(() => {
        manager.dispose();
    });

    // ── setExplanation / getFullExplanation ───────────────────────────────────

    test('stores and retrieves the full explanation text', async () => {
        const editor = await openTempEditor('const x = 1;\nconst y = 2;');
        manager.setExplanation(editor, 0, 'Declares variable x as 1', 160);

        const stored = manager.getFullExplanation(editor.document.uri.toString(), 0);
        assert.strictEqual(stored, 'Declares variable x as 1');
    });

    test('stores explanations for multiple lines independently', async () => {
        const editor = await openTempEditor('const a = 1;\nconst b = 2;\nconst c = 3;');
        manager.setExplanation(editor, 0, 'Line zero explanation', 160);
        manager.setExplanation(editor, 2, 'Line two explanation', 160);

        assert.strictEqual(manager.getFullExplanation(editor.document.uri.toString(), 0), 'Line zero explanation');
        assert.strictEqual(manager.getFullExplanation(editor.document.uri.toString(), 1), undefined, 'line 1 should have no explanation');
        assert.strictEqual(manager.getFullExplanation(editor.document.uri.toString(), 2), 'Line two explanation');
    });

    test('overwriting an explanation updates the stored value', async () => {
        const editor = await openTempEditor('const x = 1;');
        manager.setExplanation(editor, 0, 'First explanation', 160);
        manager.setExplanation(editor, 0, 'Updated explanation', 160);

        assert.strictEqual(
            manager.getFullExplanation(editor.document.uri.toString(), 0),
            'Updated explanation',
        );
    });

    test('getFullExplanation returns undefined for unknown URI', () => {
        const result = manager.getFullExplanation('file:///does/not/exist', 0);
        assert.strictEqual(result, undefined);
    });

    test('getFullExplanation returns undefined for unknown line number', async () => {
        const editor = await openTempEditor('const x = 1;');
        manager.setExplanation(editor, 0, 'Some explanation', 160);

        assert.strictEqual(
            manager.getFullExplanation(editor.document.uri.toString(), 99),
            undefined,
        );
    });

    // ── clearForEditor ────────────────────────────────────────────────────────

    test('clearForEditor removes stored explanations for that document', async () => {
        const editor = await openTempEditor('const x = 1;\nconst y = 2;');
        manager.setExplanation(editor, 0, 'Explanation for line 0', 160);
        manager.setExplanation(editor, 1, 'Explanation for line 1', 160);

        manager.clearForEditor(editor);

        assert.strictEqual(manager.getFullExplanation(editor.document.uri.toString(), 0), undefined);
        assert.strictEqual(manager.getFullExplanation(editor.document.uri.toString(), 1), undefined);
    });

    // ── clearAll ──────────────────────────────────────────────────────────────

    test('clearAll removes explanations from all documents', async () => {
        const editor1 = await openTempEditor('const a = 1;');
        const editor2 = await openTempEditor('const b = 2;');

        manager.setExplanation(editor1, 0, 'Editor 1 line 0', 160);
        manager.setExplanation(editor2, 0, 'Editor 2 line 0', 160);

        manager.clearAll();

        assert.strictEqual(manager.getFullExplanation(editor1.document.uri.toString(), 0), undefined);
        assert.strictEqual(manager.getFullExplanation(editor2.document.uri.toString(), 0), undefined);
    });

    // ── auto-clear on document change ─────────────────────────────────────────

    test('explanations are cleared automatically when the document is modified', async () => {
        // Open an untitled document with content so it can be edited
        const doc = await vscode.workspace.openTextDocument({
            language: 'typescript',
            content: 'const x = 1;',
        });
        const editor = await vscode.window.showTextDocument(doc, { preserveFocus: true });
        manager.setExplanation(editor, 0, 'Explanation to be auto-cleared', 160);

        // Verify set
        assert.ok(
            manager.getFullExplanation(doc.uri.toString(), 0) !== undefined,
            'explanation should be stored before edit',
        );

        // Apply a workspace edit to trigger onDidChangeTextDocument
        const edit = new vscode.WorkspaceEdit();
        edit.insert(doc.uri, new vscode.Position(0, 0), ' ');
        await vscode.workspace.applyEdit(edit);

        // Give the event handler a chance to run
        await new Promise<void>(resolve => setTimeout(resolve, 50));

        assert.strictEqual(
            manager.getFullExplanation(doc.uri.toString(), 0),
            undefined,
            'explanation should be auto-cleared after document change',
        );
    });
});

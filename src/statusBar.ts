import * as vscode from 'vscode';
import { ExplainMode } from './codeLensProvider';

/**
 * A status bar item showing the current Source Doc mode.
 * Clicking it toggles through line → block → both → line.
 */
export class SourceDocStatusBar implements vscode.Disposable {
    private readonly item: vscode.StatusBarItem;
    private readonly disposables: vscode.Disposable[] = [];

    constructor() {
        this.item = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100,
        );
        this.item.command = 'sourceDoc.toggleMode';
        this.item.tooltip = 'Click to cycle Source Doc mode (line / block / both)';
        this.update();
        this.item.show();

        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (
                    e.affectsConfiguration('sourceDoc.enabled') ||
                    e.affectsConfiguration('sourceDoc.mode')
                ) {
                    this.update();
                }
            }),
        );
    }

    update(): void {
        const config = vscode.workspace.getConfiguration('sourceDoc');
        const enabled = config.get<boolean>('enabled', true);
        const mode = config.get<ExplainMode>('mode', 'block');

        if (!enabled) {
            this.item.text = '$(comment) Source Doc: off';
            this.item.backgroundColor = new vscode.ThemeColor(
                'statusBarItem.warningBackground',
            );
        } else {
            const modeIcon: Record<ExplainMode, string> = {
                line: '$(list-flat)',
                block: '$(symbol-method)',
                both: '$(list-tree)',
            };
            this.item.text = `${modeIcon[mode] ?? ''} Source Doc: ${mode}`;
            this.item.backgroundColor = undefined;
        }
    }

    dispose(): void {
        this.item.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}

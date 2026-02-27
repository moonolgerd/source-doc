import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
    try {
        // Root of the extension (where package.json lives)
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');
        // Compiled test suite entry-point
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            // Suppress the VS Code splash window during CI runs
            launchArgs: ['--disable-extensions'],
        });
    } catch (err) {
        console.error('Failed to run tests:', err);
        process.exit(1);
    }
}

main();

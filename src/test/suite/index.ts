import * as path from 'path';
import Mocha = require('mocha');
import { glob } from 'glob';

/**
 * Entry-point required by @vscode/test-electron.
 * Discovers all *.test.js files in the compiled output directory and
 * hands them to Mocha.
 */
export function run(): Promise<void> {
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 15_000,
    });

    const testsRoot = path.resolve(__dirname, '.');

    return new Promise((resolve, reject) => {
        glob('**/*.test.js', { cwd: testsRoot })
            .then(files => {
                files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));
                mocha.run((failures: number) => {
                    if (failures > 0) {
                        reject(new Error(`${failures} test(s) failed.`));
                    } else {
                        resolve();
                    }
                });
            })
            .catch(reject);
    });
}

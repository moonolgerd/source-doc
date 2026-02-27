import * as assert from 'assert';
import { contentHash, truncate, languageLabel } from '../../util';

suite('util.ts', () => {

    // ── contentHash ──────────────────────────────────────────────────────────

    suite('contentHash', () => {
        test('returns a 16-character lowercase hex string', () => {
            const hash = contentHash('hello world');
            assert.strictEqual(hash.length, 16);
            assert.match(hash, /^[0-9a-f]{16}$/, 'should only contain hex characters');
        });

        test('deterministic: same input always gives same hash', () => {
            assert.strictEqual(contentHash('deterministic'), contentHash('deterministic'));
        });

        test('different inputs produce different hashes', () => {
            assert.notStrictEqual(contentHash('alpha'), contentHash('beta'));
        });

        test('empty string produces a valid hash', () => {
            const hash = contentHash('');
            assert.strictEqual(hash.length, 16);
            assert.match(hash, /^[0-9a-f]{16}$/);
        });

        test('concatenation is order-sensitive: same code with different langIds differ', () => {
            // The key is hash(code + languageId), so different languageIds must yield
            // different keys even for identical code.
            assert.notStrictEqual(
                contentHash('const x = 1;' + 'typescript'),
                contentHash('const x = 1;' + 'javascript'),
            );
        });
    });

    // ── truncate ──────────────────────────────────────────────────────────────

    suite('truncate', () => {
        test('returns original text when within maxLength', () => {
            assert.strictEqual(truncate('hello', 10), 'hello');
        });

        test('exactly at maxLength boundary returns unchanged text', () => {
            assert.strictEqual(truncate('abcde', 5), 'abcde');
        });

        test('truncates long text and appends ellipsis character', () => {
            const result = truncate('hello world', 8);
            assert.ok(result.endsWith('…'), `Expected ellipsis, got: "${result}"`);
            assert.ok(result.length <= 8, `Expected length ≤ 8, got ${result.length}`);
        });

        test('collapses internal whitespace to a single space', () => {
            assert.strictEqual(truncate('hello   world', 30), 'hello world');
        });

        test('trims leading and trailing whitespace', () => {
            assert.strictEqual(truncate('  hello  ', 30), 'hello');
        });

        test('truncated text has no trailing space before ellipsis', () => {
            const result = truncate('word1 word2 word3', 10);
            // The part before '…' must not end with a space
            const withoutEllipsis = result.slice(0, -1);
            assert.ok(!withoutEllipsis.endsWith(' '), `Found trailing space: "${result}"`);
        });
    });

    // ── languageLabel ─────────────────────────────────────────────────────────

    suite('languageLabel', () => {
        const knownMappings: Array<[string, string]> = [
            ['typescript',      'TypeScript'],
            ['typescriptreact', 'TypeScript (React/TSX)'],
            ['javascript',      'JavaScript'],
            ['javascriptreact', 'JavaScript (React/JSX)'],
            ['csharp',          'C#'],
            ['xaml',            'XAML'],
            ['python',          'Python'],
            ['java',            'Java'],
            ['cpp',             'C++'],
            ['c',               'C'],
            ['go',              'Go'],
            ['rust',            'Rust'],
            ['ruby',            'Ruby'],
        ];

        for (const [id, expected] of knownMappings) {
            test(`maps '${id}' to '${expected}'`, () => {
                assert.strictEqual(languageLabel(id), expected);
            });
        }

        test('falls back to the language ID for unknown languages', () => {
            assert.strictEqual(languageLabel('cobol'), 'cobol');
            assert.strictEqual(languageLabel('haskell'), 'haskell');
        });

        test('empty string returns empty string', () => {
            assert.strictEqual(languageLabel(''), '');
        });
    });
});

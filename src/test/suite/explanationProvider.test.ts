import * as assert from 'assert';
import * as vscode from 'vscode';
import { ExplanationProvider } from '../../explanationProvider';

// ── Mock helpers ─────────────────────────────────────────────────────────────

/** Build a fake LanguageModelChat that yields the supplied text chunks. */
function makeFakeModel(chunks: string[]): vscode.LanguageModelChat {
    return {
        sendRequest: async (
            _messages: vscode.LanguageModelChatMessage[],
            _options: vscode.LanguageModelChatRequestOptions,
            _token: vscode.CancellationToken,
        ) => ({
            text: (async function* () {
                for (const chunk of chunks) {
                    yield chunk;
                }
            })(),
        }),
    } as unknown as vscode.LanguageModelChat;
}

/** Temporarily replace `vscode.lm.selectChatModels` with `mockFn`. */
function mockSelectChatModels(mockFn: typeof vscode.lm.selectChatModels): () => void {
    const orig = (vscode.lm as Record<string, unknown>)['selectChatModels'];
    (vscode.lm as Record<string, unknown>)['selectChatModels'] = mockFn;
    return () => {
        (vscode.lm as Record<string, unknown>)['selectChatModels'] = orig;
    };
}

function neverCancelToken(): vscode.CancellationToken {
    return new vscode.CancellationTokenSource().token;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

suite('ExplanationProvider', () => {
    let provider: ExplanationProvider;

    setup(() => {
        provider = new ExplanationProvider();
    });

    teardown(() => {
        provider.dispose();
    });

    // ── Cache ─────────────────────────────────────────────────────────────────

    test('caches results: second call does not invoke the model', async () => {
        let callCount = 0;
        const restore = mockSelectChatModels(async () => {
            callCount++;
            return [makeFakeModel(['Cached explanation'])];
        });

        try {
            const first  = await provider.explain('const x = 1;', 'typescript', neverCancelToken());
            const second = await provider.explain('const x = 1;', 'typescript', neverCancelToken());

            assert.strictEqual(first, second, 'cached result should be identical');
            assert.strictEqual(callCount, 1, 'model should have been called exactly once');
        } finally {
            restore();
        }
    });

    test('different code+language pairs are cached separately', async () => {
        const responses: string[] = ['Result A', 'Result B'];
        let idx = 0;
        const restore = mockSelectChatModels(async () => [makeFakeModel([responses[idx++]])]);

        try {
            const a = await provider.explain('const a = 1;', 'typescript', neverCancelToken());
            const b = await provider.explain('const b = 2;', 'typescript', neverCancelToken());

            assert.strictEqual(a, 'Result A');
            assert.strictEqual(b, 'Result B');
            assert.notStrictEqual(a, b);
        } finally {
            restore();
        }
    });

    test('same code with different languageId is a different cache key', async () => {
        let callCount = 0;
        const restore = mockSelectChatModels(async () => {
            callCount++;
            return [makeFakeModel([`call-${callCount}`])];
        });

        try {
            await provider.explain('let x = 1;', 'typescript',  neverCancelToken());
            await provider.explain('let x = 1;', 'javascript',  neverCancelToken());

            assert.strictEqual(callCount, 2, 'different languageIds must be separate cache keys');
        } finally {
            restore();
        }
    });

    test('invalidateCache() forces the model to be called again', async () => {
        let callCount = 0;
        const restore = mockSelectChatModels(async () => {
            callCount++;
            return [makeFakeModel([`call-${callCount}`])];
        });

        try {
            await provider.explain('const x = 1;', 'typescript', neverCancelToken());
            assert.strictEqual(callCount, 1);

            provider.invalidateCache();
            await provider.explain('const x = 1;', 'typescript', neverCancelToken());
            assert.strictEqual(callCount, 2, 'model should be called again after cache invalidation');
        } finally {
            restore();
        }
    });

    // ── Error paths ───────────────────────────────────────────────────────────

    test('throws a helpful message when no Copilot model is available', async () => {
        const restore = mockSelectChatModels(async () => []);

        try {
            await assert.rejects(
                () => provider.explain('const x = 1;', 'typescript', neverCancelToken()),
                (err: Error) => {
                    assert.ok(err instanceof Error, 'should be an Error instance');
                    assert.ok(
                        err.message.includes('GitHub Copilot'),
                        `Expected message to mention GitHub Copilot, got: "${err.message}"`,
                    );
                    return true;
                },
            );
        } finally {
            restore();
        }
    });

    test('wraps vscode.LanguageModelError with code information', async () => {
        const fakeError = Object.assign(
            new Error('Not authorised'),
            { code: 'Unauthorized' },
        );
        // Make the error pass instanceof check by using Object.setPrototypeOf
        Object.setPrototypeOf(fakeError, vscode.LanguageModelError.prototype);

        const errModel = {
            sendRequest: async () => {
                throw fakeError;
            },
        } as unknown as vscode.LanguageModelChat;

        const restore = mockSelectChatModels(async () => [errModel]);

        try {
            await assert.rejects(
                () => provider.explain('const y = 2;', 'typescript', neverCancelToken()),
                (err: Error) => {
                    assert.ok(err.message.includes('Copilot error'), `Expected "Copilot error" in message, got: "${err.message}"`);
                    return true;
                },
            );
        } finally {
            restore();
        }
    });

    // ── Cancellation ──────────────────────────────────────────────────────────

    test('respects a pre-cancelled CancellationToken — returns empty or partial text', async () => {
        const source = new vscode.CancellationTokenSource();
        source.cancel();

        // Yield one chunk but the provider should stop reading after cancel
        const restore = mockSelectChatModels(async () => [
            makeFakeModel(['should not', ' reach full result']),
        ]);

        try {
            // The call should either resolve with '' (empty) or reject — both are acceptable.
            let result: string | undefined;
            try {
                result = await provider.explain('const z = 3;', 'typescript', source.token);
            } catch {
                result = undefined;
            }
            // With a pre-cancelled token the result should be '' (the loop exits immediately)
            assert.strictEqual(typeof result === 'string' ? result.length : 0, 0,
                'expected empty result for pre-cancelled token');
        } finally {
            restore();
            source.dispose();
        }
    });

    // ── Streamed result assembly ───────────────────────────────────────────────

    test('assembles streamed chunks into a single trimmed string', async () => {
        const restore = mockSelectChatModels(async () => [
            makeFakeModel(['  Returns', ' the', ' square root', '  ']),
        ]);

        try {
            const result = await provider.explain('Math.sqrt(x)', 'typescript', neverCancelToken());
            assert.strictEqual(result, 'Returns the square root');
        } finally {
            restore();
        }
    });
});

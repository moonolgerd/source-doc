import * as vscode from 'vscode';
import { contentHash, languageLabel } from './util';

interface ExplanationEntry {
    text: string;
    timestamp: number;
}

/**
 * Wraps the VS Code built-in Language Model API (GitHub Copilot) and
 * provides cached code explanations.
 */
export class ExplanationProvider implements vscode.Disposable {
    /** LRU-style cache keyed by content hash */
    private readonly cache = new Map<string, ExplanationEntry>();
    private readonly MAX_CACHE_SIZE = 200;

    async explain(
        code: string,
        languageId: string,
        token: vscode.CancellationToken,
    ): Promise<string> {
        const key = contentHash(code + languageId);
        const cached = this.cache.get(key);
        if (cached) {
            cached.timestamp = Date.now();
            return cached.text;
        }

        const config = vscode.workspace.getConfiguration('sourceDoc');
        const modelFamily: string = config.get<string>('modelFamily') ?? 'gpt-4o';

        let models: vscode.LanguageModelChat[];
        try {
            models = await vscode.lm.selectChatModels({
                vendor: 'copilot',
                family: modelFamily,
            });
        } catch {
            models = [];
        }

        // Fall back to any available Copilot model
        if (models.length === 0) {
            try {
                models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
            } catch {
                models = [];
            }
        }

        if (models.length === 0) {
            throw new Error(
                'No GitHub Copilot language model found. ' +
                'Please install the GitHub Copilot extension and sign in.',
            );
        }

        const model = models[0];
        const lang = languageLabel(languageId);
        const prompt = vscode.LanguageModelChatMessage.User(
            `You are a code documentation assistant. Explain the following ${lang} code in one concise sentence (max 30 words). ` +
            `Focus on WHAT it does, not HOW. Do not use markdown, backticks, or line breaks. ` +
            `Reply with plain text only.\n\nCode:\n\`\`\`${languageId}\n${code.trim()}\n\`\`\``,
        );

        let result = '';
        try {
            const response = await model.sendRequest([prompt], {}, token);
            for await (const chunk of response.text) {
                if (token.isCancellationRequested) {
                    break;
                }
                result += chunk;
            }
        } catch (err) {
            if (err instanceof vscode.LanguageModelError) {
                throw new Error(`Copilot error (${err.code}): ${err.message}`);
            }
            throw err;
        }

        result = result.trim();
        this.addToCache(key, result);
        return result;
    }

    invalidateCache(): void {
        this.cache.clear();
    }

    // ─── private ────────────────────────────────────────────────────────────

    private addToCache(key: string, text: string): void {
        if (this.cache.size >= this.MAX_CACHE_SIZE) {
            // Evict the oldest entry
            let oldestKey = '';
            let oldestTime = Infinity;
            for (const [k, v] of this.cache) {
                if (v.timestamp < oldestTime) {
                    oldestTime = v.timestamp;
                    oldestKey = k;
                }
            }
            if (oldestKey) {
                this.cache.delete(oldestKey);
            }
        }
        this.cache.set(key, { text, timestamp: Date.now() });
    }

    dispose(): void {
        this.cache.clear();
    }
}

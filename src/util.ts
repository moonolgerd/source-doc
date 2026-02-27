import * as crypto from 'crypto';

/**
 * Compute a short SHA-256 hash of the given string.
 * Used for caching explanations by content.
 */
export function contentHash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/**
 * Truncate a string to `maxLength` characters, appending '…' if truncated.
 */
export function truncate(text: string, maxLength: number): string {
    const trimmed = text.trim().replace(/\s+/g, ' ');
    if (trimmed.length <= maxLength) {
        return trimmed;
    }
    return trimmed.slice(0, maxLength - 1).trimEnd() + '…';
}

/**
 * Return the VS Code language ID to human-readable name mapping for display in prompts.
 */
export function languageLabel(languageId: string): string {
    const labels: Record<string, string> = {
        typescript: 'TypeScript',
        typescriptreact: 'TypeScript (React/TSX)',
        javascript: 'JavaScript',
        javascriptreact: 'JavaScript (React/JSX)',
        csharp: 'C#',
        xaml: 'XAML',
        python: 'Python',
        java: 'Java',
        cpp: 'C++',
        c: 'C',
        go: 'Go',
        rust: 'Rust',
        ruby: 'Ruby',
    };
    return labels[languageId] ?? languageId;
}

// Fixture TypeScript file used by integration tests.
// It deliberately includes noise lines (imports, blank lines, comments, brackets)
// alongside real code lines so the isNoiseLine / CodeLens tests have a controlled corpus.

import * as path from 'path';

// A simple utility function
export function greet(name: string): string {
    const msg = `Hello, ${name}!`;
    return msg;
}

export class Calculator {
    private history: number[] = [];

    add(a: number, b: number): number {
        const result = a + b;
        this.history.push(result);
        return result;
    }

    subtract(a: number, b: number): number {
        return a - b;
    }

    getHistory(): number[] {
        return [...this.history];
    }
}

export const multiply = (a: number, b: number): number => a * b;

export interface Shape {
    area(): number;
    perimeter(): number;
}

export class Circle implements Shape {
    constructor(private readonly radius: number) {}

    area(): number {
        return Math.PI * this.radius ** 2;
    }

    perimeter(): number {
        return 2 * Math.PI * this.radius;
    }
}

// Helper arrow function
const clamp = (value: number, min: number, max: number): number => {
    if (value < min) {
        return min;
    }
    if (value > max) {
        return max;
    }
    return value;
};

export { clamp };

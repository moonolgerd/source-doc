import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { isNoiseLine, isGeneratedFile, SourceDocCodeLensProvider } from '../../codeLensProvider';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal TextDocument-like stub for isGeneratedFile(). */
function makeDoc(fsPath: string): vscode.TextDocument {
    return { uri: vscode.Uri.file(fsPath) } as vscode.TextDocument;
}

// __dirname at runtime = out/test/suite/ → navigate up to repo root then into src/test/fixtures
const FIXTURES_DIR = path.resolve(__dirname, '../../../src/test/fixtures');

// ── isNoiseLine ───────────────────────────────────────────────────────────────

suite('isNoiseLine', () => {

    suite('blank / whitespace-only lines', () => {
        test('empty string is noise', () => assert.strictEqual(isNoiseLine('', 'typescript'), true));
    });

    suite('pure-punctuation lines', () => {
        test('lone } is noise', () => assert.strictEqual(isNoiseLine('}', 'typescript'), true));
        test('"});" is noise', () => assert.strictEqual(isNoiseLine('});', 'typescript'), true));
        test('"[]" is noise',  () => assert.strictEqual(isNoiseLine('[]', 'typescript'), true));
    });

    suite('single-line comment markers', () => {
        test('// comment is noise', () => assert.strictEqual(isNoiseLine('// a comment', 'typescript'), true));
        test('# comment is noise',  () => assert.strictEqual(isNoiseLine('# a comment', 'python'), true));
        test('-- comment is noise', () => assert.strictEqual(isNoiseLine('-- sql comment', 'sql'), true));
        test('%% cell is noise',    () => assert.strictEqual(isNoiseLine('%% section', 'matlab'), true));
        test('; asm comment is noise', () => assert.strictEqual(isNoiseLine('; asm', 'asm'), true));
    });

    suite('block comment lines', () => {
        test('/* opening is noise', () => assert.strictEqual(isNoiseLine('/* start', 'typescript'), true));
        test(' * middle is noise',  () => assert.strictEqual(isNoiseLine('* middle', 'typescript'), true));
        test(' */ closing is noise', () => assert.strictEqual(isNoiseLine(' */', 'typescript'), true));
        test('bare * is noise',     () => assert.strictEqual(isNoiseLine('*', 'typescript'), true));
    });

    suite('structural-only keywords', () => {
        test('"try {" is noise',     () => assert.strictEqual(isNoiseLine('try {', 'typescript'), true));
        test('"finally {" is noise', () => assert.strictEqual(isNoiseLine('finally {', 'typescript'), true));
        test('"else {" is noise',    () => assert.strictEqual(isNoiseLine('else {', 'typescript'), true));
        test('"do {" is noise',      () => assert.strictEqual(isNoiseLine('do {', 'typescript'), true));
        test('"else" alone is noise',() => assert.strictEqual(isNoiseLine('else', 'typescript'), true));
    });

    suite('import / using / require / include directives', () => {
        test('"import * as foo" is noise',  () => assert.strictEqual(isNoiseLine("import * as foo from 'bar'", 'typescript'), true));
        test('"import React" is noise',     () => assert.strictEqual(isNoiseLine("import React from 'react'", 'typescript'), true));
        test('"export * from" is noise',    () => assert.strictEqual(isNoiseLine("export * from './util'", 'typescript'), true));
        test('"using System;" is noise',    () => assert.strictEqual(isNoiseLine('using System;', 'csharp'), true));
        test('"require(" is noise',         () => assert.strictEqual(isNoiseLine("require('fs')", 'javascript'), true));
        test('"#include <stdio>" is noise', () => assert.strictEqual(isNoiseLine('#include <stdio.h>', 'c'), true));

        // Python
        test('"import os" is noise in python',            () => assert.strictEqual(isNoiseLine('import os', 'python'), true));
        test('"from os import path" is noise in python',  () => assert.strictEqual(isNoiseLine('from os import path', 'python'), true));
        test('"from typing import List" is noise in python', () => assert.strictEqual(isNoiseLine('from typing import List', 'python'), true));

        // Go
        test('"import \"fmt\"" is noise in go',           () => assert.strictEqual(isNoiseLine('import "fmt"', 'go'), true));
        test('"import (" is noise in go',                () => assert.strictEqual(isNoiseLine('import (', 'go'), true));

        // Kotlin
        test('"import kotlin.io.*" is noise in kotlin',   () => assert.strictEqual(isNoiseLine('import kotlin.io.*', 'kotlin'), true));

        // Dart
        test('"import \'package:flutter...\'" is noise in dart', () => assert.strictEqual(isNoiseLine("import 'package:flutter/material.dart';", 'dart'), true));

        // Swift
        test('"import Foundation" is noise in swift',     () => assert.strictEqual(isNoiseLine('import Foundation', 'swift'), true));

        // Rust
        test('"use std::io;" is noise in rust',           () => assert.strictEqual(isNoiseLine('use std::io;', 'rust'), true));
        test('"use std::collections::HashMap;" is noise in rust', () => assert.strictEqual(isNoiseLine('use std::collections::HashMap;', 'rust'), true));
        test('"use {Foo, Bar};" is noise in rust',        () => assert.strictEqual(isNoiseLine('use {Foo, Bar};', 'rust'), true));
        test('"use *;" is noise in rust',                 () => assert.strictEqual(isNoiseLine('use *;', 'rust'), true));
        // Java
        test('"import java.util.List;" is noise in java', () => assert.strictEqual(isNoiseLine('import java.util.List;', 'java'), true));
        test('"import static org.junit..." is noise in java', () => assert.strictEqual(isNoiseLine('import static org.junit.Assert.*;', 'java'), true));
        // C++
        test('"#include <iostream>" is noise in cpp',     () => assert.strictEqual(isNoiseLine('#include <iostream>', 'cpp'), true));
        test('"#include \"myheader.h\"" is noise in cpp', () => assert.strictEqual(isNoiseLine('#include "myheader.h"', 'cpp'), true));
    });

    suite('XAML closing tags', () => {
        test('</Grid> is noise in xaml',  () => assert.strictEqual(isNoiseLine('</Grid>', 'xaml'), true));
        test('<!-- comment is noise in xaml', () => assert.strictEqual(isNoiseLine('<!-- comment -->', 'xaml'), true));
        test('</Grid> is NOT noise in typescript', () => assert.strictEqual(isNoiseLine('</Grid>', 'typescript'), false));
    });

    suite('real code lines — should NOT be noise', () => {
        test('const declaration', () => assert.strictEqual(isNoiseLine('const x = 42;', 'typescript'), false));
        test('function call',     () => assert.strictEqual(isNoiseLine('console.log(x);', 'typescript'), false));
        test('return statement',  () => assert.strictEqual(isNoiseLine('return result;', 'typescript'), false));
        test('class declaration', () => assert.strictEqual(isNoiseLine('class Foo {', 'typescript'), false));
        test('method signature',  () => assert.strictEqual(isNoiseLine('add(a: number, b: number): number {', 'typescript'), false));
        test('if statement',      () => assert.strictEqual(isNoiseLine('if (x > 0) {', 'typescript'), false));
        test('variable assignment', () => assert.strictEqual(isNoiseLine('x = y + z;', 'typescript'), false));

        // Python
        test('python def is not noise',      () => assert.strictEqual(isNoiseLine('def greet(name):', 'python'), false));
        test('python assignment is not noise', () => assert.strictEqual(isNoiseLine('x = 42', 'python'), false));
        test('python class is not noise',    () => assert.strictEqual(isNoiseLine('class MyClass:', 'python'), false));
        test('python return is not noise',   () => assert.strictEqual(isNoiseLine('return result', 'python'), false));

        // Go
        test('go func is not noise',          () => assert.strictEqual(isNoiseLine('func main() {', 'go'), false));
        test('go short var is not noise',     () => assert.strictEqual(isNoiseLine('x := 42', 'go'), false));
        test('go type struct is not noise',   () => assert.strictEqual(isNoiseLine('type Point struct {', 'go'), false));

        // Kotlin
        test('kotlin fun is not noise',       () => assert.strictEqual(isNoiseLine('fun main() {', 'kotlin'), false));
        test('kotlin val is not noise',       () => assert.strictEqual(isNoiseLine('val x = 42', 'kotlin'), false));
        test('kotlin class is not noise',     () => assert.strictEqual(isNoiseLine('class Greeter(val name: String) {', 'kotlin'), false));

        // Dart
        test('dart void main is not noise',   () => assert.strictEqual(isNoiseLine('void main() {', 'dart'), false));
        test('dart var is not noise',         () => assert.strictEqual(isNoiseLine('var x = 42;', 'dart'), false));
        test('dart class is not noise',       () => assert.strictEqual(isNoiseLine('class MyWidget extends StatelessWidget {', 'dart'), false));

        // Swift
        test('swift func is not noise',       () => assert.strictEqual(isNoiseLine('func greet(name: String) -> String {', 'swift'), false));
        test('swift let is not noise',        () => assert.strictEqual(isNoiseLine('let x = 42', 'swift'), false));
        test('swift class is not noise',      () => assert.strictEqual(isNoiseLine('class MyClass {', 'swift'), false));

        // Rust
        test('rust fn is not noise',          () => assert.strictEqual(isNoiseLine('fn main() {', 'rust'), false));
        test('rust let is not noise',         () => assert.strictEqual(isNoiseLine('let x = 42;', 'rust'), false));
        test('rust struct is not noise',      () => assert.strictEqual(isNoiseLine('struct Point { x: f64, y: f64 }', 'rust'), false));

        // C
        test('c int main is not noise',       () => assert.strictEqual(isNoiseLine('int main() {', 'c'), false));
        test('c printf is not noise',         () => assert.strictEqual(isNoiseLine('printf("hello");', 'c'), false));
        test('c variable decl is not noise',  () => assert.strictEqual(isNoiseLine('int x = 42;', 'c'), false));

        // Java
        test('java class is not noise',       () => assert.strictEqual(isNoiseLine('public class Main {', 'java'), false));
        test('java method is not noise',      () => assert.strictEqual(isNoiseLine('public static void main(String[] args) {', 'java'), false));
        test('java variable is not noise',    () => assert.strictEqual(isNoiseLine('int x = 42;', 'java'), false));
        test('java return is not noise',      () => assert.strictEqual(isNoiseLine('return result;', 'java'), false));

        // C++
        test('cpp class is not noise',        () => assert.strictEqual(isNoiseLine('class MyClass {', 'cpp'), false));
        test('cpp cout is not noise',         () => assert.strictEqual(isNoiseLine('std::cout << "hello";', 'cpp'), false));
        test('cpp int main is not noise',     () => assert.strictEqual(isNoiseLine('int main() {', 'cpp'), false));
    });
});

// ── isGeneratedFile ───────────────────────────────────────────────────────────

suite('isGeneratedFile', () => {

    suite('files that SHOULD be skipped', () => {
        const generated = [
            'index.d.ts',
            'foo.g.cs',
            'bar.g.i.cs',
            'something.generated.ts',
            'Form1.designer.cs',
            'bundle.min.js',
            'style.min.css',
            'app.min.mjs',
            'service.pb.go',
            'assemblyinfo.cs',
            'AssemblyInfo.cs',   // case-insensitive check
        ];
        for (const name of generated) {
            test(`"${name}" is a generated file`, () => {
                assert.strictEqual(isGeneratedFile(makeDoc(`/repo/${name}`)), true);
            });
        }
    });

    suite('regular files that should NOT be skipped', () => {
        const regular = [
            'index.ts',
            'util.js',
            'main.go',
            'Program.cs',
            'styles.css',
        ];
        for (const name of regular) {
            test(`"${name}" is not a generated file`, () => {
                assert.strictEqual(isGeneratedFile(makeDoc(`/repo/${name}`)), false);
            });
        }
    });
});

// ── SourceDocCodeLensProvider ─────────────────────────────────────────────────

suite('SourceDocCodeLensProvider', () => {
    let provider: SourceDocCodeLensProvider;
    const cancelToken: vscode.CancellationToken = new vscode.CancellationTokenSource().token;

    suiteSetup(async () => {
        // Ensure the extension settings are in a known state
        const config = vscode.workspace.getConfiguration('sourceDoc');
        await config.update('enabled', true, vscode.ConfigurationTarget.Global);
        await config.update('mode', 'line', vscode.ConfigurationTarget.Global);
        provider = new SourceDocCodeLensProvider();
    });

    suiteTeardown(async () => {
        provider.dispose();
        // Restore defaults
        const config = vscode.workspace.getConfiguration('sourceDoc');
        await config.update('mode', 'block', vscode.ConfigurationTarget.Global);
    });

    test('returns [] for a generated file (*.d.ts)', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'typescript',
            content: 'export type Foo = string;',
        });
        // Simulate a generated path by creating a minimal stub
        const stubDoc = {
            ...doc,
            uri: vscode.Uri.file('/repo/types/index.d.ts'),
            lineCount: doc.lineCount,
            lineAt: (i: number) => doc.lineAt(i),
            getText: (range?: vscode.Range) => doc.getText(range),
            languageId: doc.languageId,
        } as vscode.TextDocument;

        const lenses = await provider.provideCodeLenses(stubDoc, cancelToken);
        assert.strictEqual(lenses.length, 0, 'expected no lenses for a .d.ts file');
    });

    test('returns [] when sourceDoc.enabled is false', async () => {
        const config = vscode.workspace.getConfiguration('sourceDoc');
        await config.update('enabled', false, vscode.ConfigurationTarget.Global);
        try {
            const doc = await vscode.workspace.openTextDocument({
                language: 'typescript',
                content: 'const x = 1;',
            });
            const lenses = await provider.provideCodeLenses(doc, cancelToken);
            assert.strictEqual(lenses.length, 0, 'expected no lenses when disabled');
        } finally {
            await config.update('enabled', true, vscode.ConfigurationTarget.Global);
        }
    });

    test('returns [] (no lenses) when mode is "none"', async () => {
        const config = vscode.workspace.getConfiguration('sourceDoc');
        await config.update('mode', 'none', vscode.ConfigurationTarget.Global);
        try {
            const doc = await vscode.workspace.openTextDocument({
                language: 'typescript',
                content: 'const x = 1;\nconst y = 2;',
            });
            const lenses = await provider.provideCodeLenses(doc, cancelToken);
            assert.strictEqual(lenses.length, 0, 'expected no lenses in "none" mode');
        } finally {
            await config.update('mode', 'line', vscode.ConfigurationTarget.Global);
        }
    });

    test('always includes a file-level "Explain file" lens at line 0', async () => {
        const doc = await vscode.workspace.openTextDocument({
            language: 'typescript',
            content: 'const x = 1;\n',
        });
        const lenses = await provider.provideCodeLenses(doc, cancelToken);
        const fileLens = lenses.find(l => l.command?.command === 'sourceDoc.explainFile');
        assert.ok(fileLens, 'missing file-level explainFile lens');
        assert.strictEqual(fileLens.range.start.line, 0);
    });

    test('in line mode returns a lens for each non-noise line (plus file lens)', async () => {
        await vscode.workspace.getConfiguration('sourceDoc').update('mode', 'line', vscode.ConfigurationTarget.Global);

        const doc = await vscode.workspace.openTextDocument({
            language: 'typescript',
            content: [
                'const a = 1;',   // line 0 — real code
                '',               // line 1 — noise (empty)
                '// comment',     // line 2 — noise
                'const b = 2;',   // line 3 — real code
            ].join('\n'),
        });

        const lenses = await provider.provideCodeLenses(doc, cancelToken);
        const lineLenses = lenses.filter(l => l.command?.command === 'sourceDoc.explainLine');
        // Expect exactly 2 Explain-line lenses (lines 0 and 3)
        assert.strictEqual(lineLenses.length, 2, `expected 2 line lenses, got ${lineLenses.length}`);
        assert.strictEqual(lineLenses[0].range.start.line, 0);
        assert.strictEqual(lineLenses[1].range.start.line, 3);
    });

    test('in "file" mode only the file-level lens is produced', async () => {
        await vscode.workspace.getConfiguration('sourceDoc').update('mode', 'file', vscode.ConfigurationTarget.Global);
        try {
            const doc = await vscode.workspace.openTextDocument({
                language: 'typescript',
                content: 'const x = 1;\nconst y = 2;',
            });
            const lenses = await provider.provideCodeLenses(doc, cancelToken);
            assert.strictEqual(lenses.length, 1, 'expected exactly 1 lens in file mode');
            assert.strictEqual(lenses[0].command?.command, 'sourceDoc.explainFile');
        } finally {
            await vscode.workspace.getConfiguration('sourceDoc').update('mode', 'line', vscode.ConfigurationTarget.Global);
        }
    });

    test('opens the fixture file and returns lenses for real code lines', async () => {
        await vscode.workspace.getConfiguration('sourceDoc').update('mode', 'line', vscode.ConfigurationTarget.Global);
        const docUri = vscode.Uri.file(path.join(FIXTURES_DIR, 'sample.ts'));
        const doc = await vscode.workspace.openTextDocument(docUri);
        const lenses = await provider.provideCodeLenses(doc, cancelToken);
        // There should be more than 1 lens (the file lens + at least several line lenses)
        assert.ok(lenses.length > 1, `expected multiple lenses for sample.ts, got ${lenses.length}`);
        // First lens at line 0 is always the file lens
        const fileLens = lenses.find(l => l.command?.command === 'sourceDoc.explainFile');
        assert.ok(fileLens, 'missing file-level lens in sample.ts');
    });

    test('refresh() fires onDidChangeCodeLenses', () => {
        return new Promise<void>((resolve) => {
            const sub = provider.onDidChangeCodeLenses(() => {
                sub.dispose();
                resolve();
            });
            provider.refresh();
        });
    });
});

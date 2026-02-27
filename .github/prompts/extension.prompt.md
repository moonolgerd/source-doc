---
agent: agent
description: Scaffold a new VS Code extension with proper project structure, activation events, commands, and CI publishing to the VS Code Marketplace.
model: Claude Sonnet 4.6 (copilot)
---

Create a new VS Code extension with the following requirements:

## Project Setup

- Use `yo code` conventions but scaffold manually (do not run generators)
- Language: **TypeScript**
- Target VS Code engine: `^1.96.0` or later
- Node.js version: `20.x` or later

## Project Structure

```
${input:extensionName}/
  .vscode/
    launch.json          # F5 debug config
    tasks.json           # build task
  src/
    extension.ts         # activate / deactivate entry point
    commands/
      ${input:commandName}.ts
  test/
    extension.test.ts
  .vscodeignore
  .github/
    workflows/
      release.yml
  package.json
  tsconfig.json
  README.md
  CHANGELOG.md
```

## package.json Requirements

```json
{
  "name": "${input:extensionName}",
  "displayName": "${input:displayName}",
  "description": "${input:description}",
  "version": "0.0.1",
  "publisher": "${input:publisherId}",
  "engines": { "vscode": "^1.96.0" },
  "categories": ["Other"],
  "activationEvents": [],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [{
      "command": "${input:extensionName}.${input:commandName}",
      "title": "${input:commandTitle}"
    }]
  },
  "scripts": {
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "pretest": "npm run compile",
    "test": "vscode-test",
    "package": "vsce package",
    "publish": "vsce publish"
  }
}
```

## Extension Entry Point (`src/extension.ts`)

- Export `activate(context: vscode.ExtensionContext)` and `deactivate()`
- Register all commands inside `activate` using `vscode.commands.registerCommand`
- Push all disposables to `context.subscriptions`
- Use `vscode.window.showInformationMessage` for user feedback

## TypeScript Configuration

- `tsconfig.json` targeting `ES2022`, module `commonjs`, `outDir: ./out`, `strict: true`

## Debug Configuration (`.vscode/launch.json`)

- Include an **Extension Development Host** launch config
- Include an **Extension Tests** launch config

## Testing

- Use `@vscode/test-cli` and `@vscode/test-electron`
- Write at least one test in `test/extension.test.ts` that verifies the extension activates and the command is registered

## `.vscodeignore`

Exclude: `.vscode/`, `src/`, `test/`, `node_modules/`, `*.map`, `tsconfig.json`, `.github/`

## CI/CD Pipeline (`.github/workflows/release.yml`)

### Triggers
- Push to `main` — runs build and test only
- Published GitHub Release (tag `v*.*.*`) — builds, tests, packages, and publishes

### Jobs

#### `build` job
- `ubuntu-latest`
- `actions/setup-node@v4` with `node-version: '20.x'`
- Steps: checkout → `npm ci` → `npm run compile` → `npm test` (headless via `xvfb-run`)

#### `publish` job
- Depends on `build`, runs only on Release trigger
- Extract version from tag, patch it into `package.json` via `npm version $VERSION --no-git-tag-version`
- `npx @vscode/vsce publish --no-dependencies`
- Authenticate using `${{ secrets.VSCE_PAT }}`

### Secrets

Document that the following secret must be set in **Settings → Secrets and variables → Actions**:
- `VSCE_PAT` — Personal Access Token from [Azure DevOps](https://dev.azure.com) with **Marketplace → Manage** scope

### Version Strategy
- Version driven by the GitHub Release tag (`v1.2.3` → `1.2.3`)
- Do not hardcode a final version in `package.json`; use `0.0.1` as local development fallback

## README

Generate a `README.md` that includes:
- Extension description and features
- Installation: via VS Code Marketplace and `code --install-extension ${input:publisherId}.${input:extensionName}`
- How to invoke the command (Command Palette entry)
- Local development: `npm ci`, `npm run compile`, press `F5` to launch Extension Development Host
- How to package locally: `npx @vscode/vsce package`

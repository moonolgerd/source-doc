---
name: bump_version
description: This prompt should be used when user asks to bump or update version number
tools: ["agent", "read", "edit"]
---

When user asks to bump/update version number, go to CONTRIBUTING.md and replace [Unreleased] with the actual incremented version number, where the number needs to be incremented by patch verson. Add [Unreleased] above the version number.
Update instruction files in the workspace.
Update README.md.
Create a new tag and push to remote.
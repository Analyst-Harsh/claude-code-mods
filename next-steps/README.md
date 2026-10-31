# next-steps

**After each reply, a small band above the prompt suggests what you'd most likely ask next. Click one to fill the prompt.**

[![license](https://img.shields.io/badge/license-MIT-7aa2f7?style=flat-square)](../LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-%E2%89%A5%202.1.310-1f1e1d?style=flat-square)](https://claude.com/claude-code)
[![mod](https://img.shields.io/badge/mod-early%20access-b18cf2?style=flat-square)](#notes--quirks)

```
▾ next steps  3
┃ Run the tests in hooks/
┃ Commit the README change
┃ Tag next-steps-v0.1.0
╰ ✓ yes, proceed   ? explain why
```

## Install

```
/plugin marketplace add Analyst-Harsh/claude-code-mods
/plugin install next-steps@claude-code-mods
```

## Use

- When a reply finishes, the band shows `next steps ⋯` while it thinks, then up to 3 short prompts.
- Press **1–3** or click a step to put it in the prompt. It fills the prompt but doesn't send it, so you can edit it first.
- The two chips after the steps, **yes, proceed** and **explain why**, take the next numbers.
- Click the `next steps` header to collapse or expand the band.

## How it works

On `turn.complete`, the mod starts a background `$.model.fork` that reads the reply that just finished and returns a list of steps in JSON. The reply itself is never rewritten, and the main conversation never sees the fork. Sending a new prompt clears the band, and a fork that finishes late, for a turn that's already over, is dropped. Replies from subagents are skipped.

Colors are Tokyo Night (Night), with the same accent as the status line (`#7aa2f7`).

## Notes & quirks

- Reloading the mod cancels a fork that's still running, so the turn that edits the mod gets no band.
- Mods loaded from `CLAUDE_CODE_PLUGIN_DIRS` load only when the process starts. `/clear` and `/compact` don't reload them.
- Each suggestion is one extra small model call per reply.
- To do: add a banner and a demo gif, like side-ask has.

## Develop

```
claude plugin test next-steps
```

MIT © Harshit Goyal

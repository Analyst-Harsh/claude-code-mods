<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/banner-dark.svg">
  <img src="docs/banner-light.svg" alt="side-ask: ask on the side, keep your context clean" width="100%">
</picture>

**Ask about any part of Claude's reply. The answer lives in a side pane, never in your context.**

[![version](https://img.shields.io/badge/version-0.7.0-d97757?style=flat-square)](../CHANGELOG.md)
[![tests](https://img.shields.io/badge/tests-18%20passing-4eba65?style=flat-square)](hooks/register.test.tsx)
[![license](https://img.shields.io/badge/license-MIT-7aa2f7?style=flat-square)](../LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-%E2%89%A5%202.1.310-1f1e1d?style=flat-square)](https://claude.com/claude-code)
[![mod](https://img.shields.io/badge/mod-early%20access-b18cf2?style=flat-square)](#notes--quirks)

<br>

<img src="docs/demo.gif" alt="Selecting a phrase in Claude's reply, typing ;w and pressing shift+enter: a side pane opens beside the chat and answers why, while the main conversation stays untouched." width="900">

</div>

<br>

## Why

You're reading a long reply and one phrase doesn't click. Asking in the main chat costs more than it looks:

| | Without side-ask | With side-ask |
|---|---|---|
| **Your tangent** | Piles into the context, forever | Answered in a pane, never added |
| **The thread** | Derails; Claude may act on your aside | The main task stays on track |
| **Cost** | Every later turn carries it | One forked call that reuses the cache |
| **Your place** | The chat jumps to the bottom | The chat stays where you were reading |

## How it works

1. **Select** any text in Claude's reply with the mouse.
2. **Type** `; your question`, or a one-key preset like `;w`.
3. **Press shift+enter.** The pane docks beside the chat and answers. Nothing is added to the conversation.

Ask again without a new selection to follow up on the same excerpt. Select something else to start a new thread in the pane.

## Keys

| | Type | Asks |
|:-:|---|---|
| 🟢 | `;` | Explain this simply |
| 🔵 | `;e` | Show a minimal code example |
| 🟡 | `;w` | Why is it done this way? |
| 🔴 | `;p` | Common pitfalls and gotchas |
| 🟣 | `;v` | Compare with the alternatives |
| 💬 | `; text` | Your own question |
| ⚪ | `;x` | Close the pane (clears its history) |

Typing `;` shows these keys under the prompt. `/side` opens the pane on its own.

## Install

Inside Claude Code:

```
/plugin marketplace add Analyst-Harsh/claude-code-mods
/plugin install side-ask@claude-code-mods
```

Or from your shell:

```sh
claude plugin install side-ask --marketplace Analyst-Harsh/claude-code-mods
```

> [!NOTE]
> Requires Claude Code **2.1.310** or newer. Mods are an early-access surface and may change between releases.

<details>
<summary><b>Notes & quirks</b></summary>
<a id="notes--quirks"></a>

- Answers come from `$.model.fork`, which reuses the conversation's cache. They're never written to the transcript.
- Plain Enter works too, but submitting jumps the chat to the bottom. The mod then scrolls back to the message you selected (its top, if it's taller than the window).
- Opening the pane narrows the chat, so the text rewraps and your line drifts a few rows. The engine can only scroll the chat to whole messages, never to a line.
- Resize the pane by dragging its left edge. The engine caps it at 45% of the terminal and remembers your width.
- After you close the pane with ×, shift+enter can't reopen it in a terminal under 144 columns: the engine counts shift+enter as unasked. A toast says so; press Enter once and shift+enter works again. `;x` doesn't have this problem.
- Scroll the pane with the mouse wheel, or press ctrl+x tab and then ↑↓ (Esc gives the keys back).
- Only single-line drafts you type yourself trigger it. A multi-line draft starting with `;`, or a prompt from a scheduled task or another session, goes to Claude as usual.

</details>

<details>
<summary><b>Develop</b></summary>

1. Clone the repo and add this folder to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`. Separate multiple folders with `:`.
2. Start a session once. Claude Code then writes the engine types to `.claude-plugin/types/` (gitignored), and `tsc` works after that.
3. Run the tests: `claude plugin test side-ask`.
4. Re-record the demo: `scripts/make-gif.sh <recording.mov> "<start-end,…>"` turns a screen recording into `docs/demo.gif` (usage in the script header).

</details>

<br>

<div align="center"><sub>MIT © Harshit Goyal · part of <a href="../">claude-code-mods</a> · <a href="../CHANGELOG.md">changelog</a></sub></div>

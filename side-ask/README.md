# side-ask

Ask a quick question about part of Claude's reply without adding it to the conversation.

1. Select text in the chat with the mouse.
2. Type `; your question` in the prompt.
3. Press **shift+enter**. The answer shows in a pane beside the chat, and the chat stays where you are.

| Type | Asks |
|---|---|
| `;` | explain simply |
| `;e` | a code example |
| `;w` | why it's done this way |
| `;p` | pitfalls |
| `;v` | compare with alternatives |
| `; text` | your own question (ask again to follow up on the same excerpt) |
| `;x` | close the pane (this also clears its history) |

Notes:
- Plain Enter works too, but submitting jumps the chat to the bottom. The mod then scrolls back to the message you selected (its top, if it's taller than the window).
- Opening the pane narrows the chat, so the text rewraps and your line drifts a few rows down. The engine can only scroll the chat to whole messages, never to a line, so a mod can't hold your exact line.
- Resize the pane by dragging its left edge. The engine caps it at 45% of the terminal and remembers your width.
- After you close the pane with ×, shift+enter can't reopen it in a terminal under 144 columns: the engine counts shift+enter as unasked. A toast says so; press Enter once and shift+enter works again. `;x` doesn't have this problem.
- Typing `;` shows the triggers under the prompt.
- Scroll the pane with the mouse wheel, or press ctrl+x tab and then ↑↓ (Esc gives the keys back).
- `/side` opens the pane with these tips.
- Answers come from `$.model.fork`, which reuses the conversation's cache. They're never written to the transcript.

## Install

In a Claude Code terminal session:

```
/plugin install side-ask --marketplace Analyst-Harsh/claude-code-mods
```

Answer `y` to add the marketplace, then pick a scope.

To develop it, add this folder to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json` instead. Separate multiple folders with `:`.

Run the tests with `claude plugin test <folder>`.

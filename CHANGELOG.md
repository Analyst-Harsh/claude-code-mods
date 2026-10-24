# Changelog

## side-ask

### 0.7.0

**Behaviour changes**
- Only single-line drafts trigger. A multi-line draft that starts with `;` (an asm, INI or Lisp comment) is typed and sent as usual; before, shift+enter turned it into a side ask and wiped it.
- A leading space (` ; why?`) now asks on the side with Enter too, the same as with shift+enter.
- Only prompts you type in the terminal trigger. Scheduled tasks, `/loop`, other sessions and the Remote Control bridge go to Claude as usual.
- If a side ask fails while you're typing, your draft is kept and Claude Code names the failing hook. Before, the draft was cleared silently.
- The key hint under the prompt shows only for drafts that would actually trigger.
- `;x` with Enter now says "side pane closed" instead of "asked on the side".

**Fixes**
- Asking the same question again right after `;x` no longer loses its spinner early.
- A new excerpt stays current when an earlier ask lands after it. Before, a follow-up could ask about the wrong text.
- One excerpt keeps at most its latest 60 answers.
- A failure reason this version doesn't know shows as words instead of breaking the pane.

**Project**
- MIT license, the 0.7.0 manifest, a new README with a demo, and 6 new tests (18 in all).

### 0.6.0

First release: select text, type `; question`, and press shift+enter. The answer shows in a side pane and never enters the conversation.

# claude-code-mods

Mods for [Claude Code](https://claude.com/claude-code): small changes to its own interface.

| Mod | What it does |
|---|---|
| [side-ask](side-ask/) | Select text in a reply, type `; question`, press shift+enter: the answer shows in a side pane and never enters the main conversation. |

## Install

In a Claude Code terminal session:

```
/plugin install side-ask --marketplace Analyst-Harsh/claude-code-mods
```

Answer `y` to add the marketplace, then pick a scope.

## Adding a mod

Put it in its own folder and add a line to `.claude-plugin/marketplace.json`:

```json
{ "name": "<mod>", "source": "./<mod>" }
```

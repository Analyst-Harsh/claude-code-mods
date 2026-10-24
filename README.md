<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="side-ask/docs/banner-dark.svg">
  <img src="side-ask/docs/banner-light.svg" alt="side-ask: ask on the side, keep your context clean" width="100%">
</picture>

<h1 align="center">claude-code-mods</h1>

**Small mods that change [Claude Code](https://claude.com/claude-code)'s own interface.**

[![license](https://img.shields.io/badge/license-MIT-7aa2f7?style=flat-square)](LICENSE)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-%E2%89%A5%202.1.310-1f1e1d?style=flat-square)](https://claude.com/claude-code)
[![mods](https://img.shields.io/badge/mods-early%20access-b18cf2?style=flat-square)](#install)

</div>

## Mods

<table>
<tr>
<td width="58%"><a href="side-ask/"><img src="side-ask/docs/demo.gif" alt="side-ask demo: a side pane answers a question about selected text" width="100%"></a></td>
<td>

### [side-ask](side-ask/) <sub>`0.7.0`</sub>

Select text in a reply, type `; question` and press **shift+enter**. The answer shows in a side pane and never enters the main conversation.

`;` explain · `;e` example · `;w` why · `;p` pitfalls · `;v` vs · `;x` close

**[Read more →](side-ask/)**

</td>
</tr>
</table>

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

## Adding a mod

Put it in its own folder with a `.claude-plugin/plugin.json`, then add a line to `.claude-plugin/marketplace.json`:

```json
{ "name": "<mod>", "source": "./<mod>" }
```

Record its notable changes in [CHANGELOG.md](CHANGELOG.md).

<div align="center"><sub>MIT © Harshit Goyal</sub></div>

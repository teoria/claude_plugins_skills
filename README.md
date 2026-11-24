# claude_plugins_skills

Claude Code plugins and skills.

- `plugins/` — one folder per plugin, listed in `.claude-plugin/marketplace.json`.
- `skills/` — one folder per skill, each with a `SKILL.md`.

## Install a plugin

Add this repo as a marketplace once, then install any plugin from it by `<plugin>@teoria`. For example, context-guard:

```
/plugin marketplace add teoria/claude_plugins_skills
/plugin install context-guard@teoria
```

From a shell: `claude plugin marketplace add teoria/claude_plugins_skills && claude plugin install context-guard@teoria`.

Its pane opens beside the chat on the next session start, and `/context-guard` reopens it. See [its README](plugins/context-guard/README.md) for what the pane shows.

## Plugins

- [context-guard](plugins/context-guard) — charts context tokens per agent and alerts when a subagent passes 300k.

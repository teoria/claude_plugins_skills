# claude_plugins_skills

Claude Code plugins and skills.

- `plugins/` — one folder per plugin, listed in `.claude-plugin/marketplace.json`.
- `skills/` — one folder per skill, each with a `SKILL.md`.

## Install a plugin

```
/plugin marketplace add teoria/claude_plugins_skills
/plugin install <plugin>@teoria
```

## Plugins

- [context-guard](plugins/context-guard) — charts context tokens per agent and alerts when a subagent passes 300k.

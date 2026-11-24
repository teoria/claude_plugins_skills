# claude_plugins_skills

Claude Code plugins and skills.

- `plugins/` — one folder per plugin, listed in `.claude-plugin/marketplace.json`.
- `skills/` — one folder per skill, each with a `SKILL.md`.

## Install a plugin

Install any plugin by name, pointing at this repo. For example, context-guard:

```
/plugin install context-guard --marketplace teoria/claude_plugins_skills
```

Answer `y` to add the marketplace (`teoria-tools`) the first time. From a shell: `claude plugin install context-guard --marketplace teoria/claude_plugins_skills`.

Its pane opens beside the chat on the next session start, and `/context-guard` reopens it. See [its README](plugins/context-guard/README.md) for what the pane shows.

## Plugins

- [context-guard](plugins/context-guard) — charts context tokens per agent and alerts when a subagent passes 300k.

## Skills

Copy a skill's folder into `~/.claude/skills/` to use it in every project, or into a project's `.claude/skills/` for that project only.

- [slack-business-english](skills/slack-business-english) — turns Portuguese or informal English into short, professional Slack messages.

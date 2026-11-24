# context-guard for Claude Code

Shows where every agent's context stands and alerts when a subagent passes 300k tokens.

What it does:

- **Context pane.** A pane beside the chat with a line chart, each line's latest value labeled on the y-axis (MAIN, one agent, or one line per running subagent in its own color against the 250k and 300k lines; each agent is checked on its own, nothing is summed), tiles for the main session's context, agent count, running agents, total context and total output, and a delegation tree: one row per subagent, drawn with tree branches (├─ └─) under the agent that spawned it, with its type, task, context, share of its model's context window, output tokens and run time.
- **MAIN by default.** The chart opens on MAIN, the main session's context over the last 20 minutes, from 0 to the model's window, with no limit lines (250k and 300k are per-agent limits). Press an agent's row to see its whole run spread across the chart from 0s at the left edge to its run time at the right, with a detail line; press it again to go back to MAIN. Press MAIN while it shows to see one line per running subagent.
- **MAIN at 70% and 80%.** When the main session reaches 70% and then 80% of its model's context window, a toast says so once each, its number turns orange then red, and the MAIN chart draws dashed 70% and 80% lines. Falling back under 70% (after a compaction, say) re-arms both.
- **Compact main.** A button in the pane's header compacts the main session, as `/compact` does, and a toast reports the size before and after. Claude Code allows it only between turns; pressed during a turn, a toast says to press again when the turn ends. Subagents cannot be compacted on demand: they compact themselves near their own window.
- **Alert at 300k.** When a subagent's context passes 300k, a toast names it once and its row is marked `over limit`. The agent keeps running: nothing is refused or stopped. The main session is never flagged.

The chart, tiles and the MAIN row stay pinned at the top; the mouse wheel or trackpad over the pane scrolls only the agent list, which shows `rows 5–14 of 30 · scroll for more` when it does not fit.

`/context-guard` reopens the pane. The pane docks beside the chat in the terminal's fullscreen layout from about 144 columns.

Context is Claude Code's own per-agent reading (latest request input plus the agent's output), so it can read slightly above the true window. The check runs every 5 seconds, so an alert can come a few seconds after the crossing. Workflow agents are not listed by Claude Code, so they do not appear. The limits are constants in `hooks/register.tsx` (`WARN`, `LIMIT`, `MAIN_WARN`, `MAIN_LIMIT`).

## Example

A session with four subagents: the main session spawned a `general-purpose` agent to refactor a billing module, which spawned an `Explore` and a `Plan` agent of its own, plus one more `Explore` at the top level. The refactor agent has passed 300k, so it was alerted once and its row shows `▲` (the `over limit` mark is cut off at this width); it was pressed, so the chart shows its whole run against the 250k and 300k lines. The `Plan` agent is done and draws dimmed. (Colors are left out here: in the terminal each line, tag and number is colored.)

```
context guard                                              Compact main
 472k ┤
      ┤
      ┤
 342k ┤                                                   ╭──────────
 300k ┤┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╭─────╯┄┄┄┄┄┄┄┄┄┄
 250k ┤┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╭───╯┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
      ┤                                   ╭─────╯
      ┤                              ╭────╯
      ┤                        ╭─────╯
      ┤                   ╭────╯
      ┤           ╭───────╯
    0 ┤───────────╯
      └ 0s                                                       14m32
        whole run, start to finish; press its row again for MAIN
general-purpose · refactor billing module · context 342k (34% of 1.0M) · peak 342k · output 18.4k · 14m32 · over limit
╭──────────╮ ╭────────╮ ╭─────────╮ ╭───────────╮ ╭──────────╮
│   312k   │ │   4    │ │    3    │ │   752k    │ │  35.9k   │
│ main 31% │ │ agents │ │ running │ │ Σ windows │ │ Σ output │
╰──────────╯ ╰────────╯ ╰─────────╯ ╰───────────╯ ╰──────────╯
Delegation
▎●  MAIN  main session                        312k  31%
▶●  general-purpose  refactor billing modul  ▲342k  34%   ↑18.4k 14m32
▎├─●  Explore  find invoice callers          58.2k  29%    ↑4.2k  3m10
▎└─●  Plan  migration plan                    121k  61%    ↑9.7k  6m45
▎●  Explore  scan test fixtures              40.1k  20%    ↑3.6k  2m02
```

When it crossed 300k, a toast said `context-guard: "refactor billing module" passed 300k (301k)`, once. The main session, at 31% of its 1.0M window, is under its 70% warning, so its number is green.

## Install

At the prompt of a Claude Code session in a terminal:

```
/plugin install context-guard --marketplace teoria/claude_plugins_skills
```

Answer `y` to add the marketplace (`teoria-tools`) the first time, then press Enter to install it for your user.

From a shell: `claude plugin install context-guard --marketplace teoria/claude_plugins_skills`.

## Develop

`claude plugin test plugins/context-guard` runs the tests; `claude plugin validate plugins/context-guard` checks the manifest and module.

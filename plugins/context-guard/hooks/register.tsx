import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register } from 'claude-code'

import type { AgentRow } from '../types'

const PANE = 'context-guard'
const WARN = 250_000
const LIMIT = 300_000
const TICK_MS = 5000
const HISTORY = 240 // 20 minutes of ticks
const HEIGHT = 12
const GREEN = '#4ade80'
const ORANGE = '#f5a524'
const RED = '#ef4444'
const CHIPS: Record<string, Color> = { Explore: '#38bdf8', 'general-purpose': '#a78bfa', Plan: '#f472b6' }
const SPARE: Color[] = ['#facc15', '#fb7185', '#34d399', '#c084fc', '#60a5fa']
// One color per agent for its chart line and its row's left bar; red and orange stay the thresholds'.
const LINES: Color[] = ['#38bdf8', '#a78bfa', '#4ade80', '#f472b6', '#facc15', '#2dd4bf', '#60a5fa', '#c084fc', '#a3e635', '#e2e8f0']

const agents = atom({ plugin: 'context-guard', key: 'agents' } as const, [], { shape: 'agents-4' })
const history = atom({ plugin: 'context-guard', key: 'history' } as const, [], { shape: 'history-2' })
const main = atom({ plugin: 'context-guard', key: 'main' } as const, 0, { shape: 'main-1' })
// The current model's context window, the full height of the MAIN and all-agents charts.
const modelWindow = atom({ plugin: 'context-guard', key: 'window' } as const, 0, { shape: 'window-1' })
// The highest MAIN warning already given (0, 70 or 80); back to 0 once MAIN falls under 70%.
// The first agent row the list shows: the pane's scroll moves the list alone, the chart stays put.
const listTop = atom({ plugin: 'context-guard', key: 'listTop' } as const, 0, { shape: 'list-top-1' })
// The last list offset the drawing allowed, for the scroll hook to clamp to (a cache, redrawn each time).
let listMax = 0
const mainAlert = atom({ plugin: 'context-guard', key: 'mainAlert' } as const, 0, { shape: 'main-alert-1' })
const MAIN = '@main'
const ALL = '@all'
// What the chart shows: MAIN (the default), one agent id, or ALL running subagents.
const selected = atom({ plugin: 'context-guard', key: 'selected' } as const, MAIN, { shape: 'selected-2' })

const PSEUDO: Record<string, { label: string; color: Color }> = {
  [MAIN]: { label: 'MAIN', color: '#00BADE' },
}

const fmt = (n: number) =>
  n < 1000 ? `${n}` : n < 1e6 ? `${(n / 1000).toFixed(n < 100_000 ? 1 : 0)}k` : `${(n / 1e6).toFixed(1)}M`
const dur = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}`
  return `${Math.floor(s / 3600)}h${String(Math.floor(s / 60) % 60).padStart(2, '0')}`
}
// A share of a model's context window; blank while the window is unknown.
const pct = (n: number, window: number) => (window > 0 ? `${Math.round((n / window) * 100)}%` : '')
// MAIN warns at 70% and 80% of its model's window.
const MAIN_WARN = 0.7
const MAIN_LIMIT = 0.8
const mainLevel = (n: number, window: number): Color =>
  window > 0 && n >= window * MAIN_LIMIT ? RED : window > 0 && n >= window * MAIN_WARN ? ORANGE : GREEN
const level = (n: number): Color => (n >= LIMIT ? RED : n >= WARN ? ORANGE : GREEN)
const chip = (type: string): Color =>
  CHIPS[type] ?? SPARE[[...type].reduce((sum, c) => sum + c.charCodeAt(0), 0) % SPARE.length] ?? GREEN

const RUN_CAP = 2000 // readings kept per agent; past it, pairs merge into their max
const halve = (xs: number[]) => xs.filter((_, i) => i % 2 === 0).map((x, i) => Math.max(x, xs[i * 2 + 1] ?? x))

// An agent's whole run spread over every column, its start at the left edge:
// a long run keeps each slice's max, a short one repeats each reading to fill the width.
const fit = (xs: number[], cols: number) =>
  xs.length === 0
    ? []
    : Array.from({ length: cols }, (_, b) =>
        xs.length > cols
          ? Math.max(...xs.slice(Math.floor((b * xs.length) / cols), Math.floor(((b + 1) * xs.length) / cols)))
          : (xs[Math.floor((b * xs.length) / cols)] ?? 0),
      )

// tokenCount is the engine's own reading: the latest request's input plus the agent's output.
const refresh = async ($: EngineInterface) => {
  const [list, usage, now] = await Promise.all([$.agent.list(), $.session.usage(), $.clock.now()])
  const live = list.filter(a => a.kind === 'local_agent')
  // Past the limit an agent keeps running: it is only flagged, with one toast the first time.
  const before = await read($, agents)
  for (const a of live) {
    if (a.tokenCount >= LIMIT && !before.find(r => r.id === a.id)?.isAlerted) {
      $.ui.toast(`context-guard: "${a.description || a.type}" passed ${fmt(LIMIT)} (${fmt(a.tokenCount)})`)
    }
  }
  await update($, agents, old => {
    const seen = live.map((a): AgentRow => {
      const prev = old.find(r => r.id === a.id)
      const isDone = a.taskStatus !== 'running' && a.taskStatus !== 'pending'
      return {
        id: a.id,
        parentId: a.parentId,
        type: a.type,
        name: a.description || a.label,
        tokens: a.tokenCount,
        window: a.contextWindowSize ?? 0,
        output: (a.usage ?? []).reduce((n, u) => n + u.output_tokens, 0),
        peak: Math.max(prev?.peak ?? 0, a.tokenCount),
        // The whole run, one reading per tick while it runs; first seen mid-run, the engine's last 16 seed it.
        samples: isDone && prev ? prev.samples : (s => (s.length > RUN_CAP ? halve(s) : s))([...(prev?.samples ?? a.tokenSamples), a.tokenCount]),
        startTime: a.startTime,
        endTime: isDone ? (prev?.endTime ?? now) : undefined,
        isDone,
        isAlerted: (prev?.isAlerted ?? false) || a.tokenCount >= LIMIT,
      }
    })
    // Agents the engine dropped stay as finished rows.
    const gone = old
      .filter(r => !live.some(a => a.id === r.id))
      .map(r => ({ ...r, isDone: true, endTime: r.endTime ?? now }))
    return [...gone, ...seen].slice(-60)
  })
  // One reading per running subagent per tick: each agent is its own line against the limit.
  // MAIN rides along under its own key.
  const mainTokens = usage.context.tokens ?? 0
  const running = live.filter(a => a.taskStatus === 'running')
  const tick: Record<string, number> = Object.fromEntries(running.map(a => [a.id, a.tokenCount]))
  tick[MAIN] = mainTokens
  await update($, history, old => [...old, tick].slice(-HISTORY))
  await update($, main, () => mainTokens)
  await update($, modelWindow, () => usage.context.window)

  const share = usage.context.window > 0 ? mainTokens / usage.context.window : 0
  const reached = share >= MAIN_LIMIT ? 80 : share >= MAIN_WARN ? 70 : 0
  const given = await read($, mainAlert)
  if (reached > given) {
    $.ui.toast(
      `context-guard: main session at ${Math.round(share * 100)}% of its context window (${fmt(mainTokens)} of ${fmt(usage.context.window)})`,
    )
  }
  const next = reached === 0 ? 0 : Math.max(given, reached)
  if (next !== given) await update($, mainAlert, () => next)
}

type Cell = { ch: string; color?: Color }

const lineColor = (rows: AgentRow[], id: string): Color =>
  PSEUDO[id]?.color ?? LINES[Math.max(0, rows.findIndex(r => r.id === id)) % LINES.length] ?? GREEN

// One line per series, each in its own color, against the 250k and 300k lines.
// No selection: every running subagent. A selection: that one series alone.
const chartRows = (
  hist: Record<string, number>[],
  rows: AgentRow[],
  sel: string,
  ctxWindow: number,
  width: number,
): Cell[][] => {
  const cols = Math.max(10, width - 8)
  const shown = (id: string) => (sel === ALL ? !PSEUDO[id] : id === sel)
  const run = rows.find(r => r.id === sel)?.samples
  const pts = run
    ? fit(run, cols).map(v => ({ [sel]: v }))
    : hist.slice(-cols).map(t => Object.fromEntries(Object.entries(t).filter(([id]) => shown(id))))
  // The 250k and 300k lines are per-agent limits: MAIN draws without them, scaled to themselves.
  const hasLimit = !PSEUDO[sel]
  const peak = Math.max(...pts.flatMap(t => Object.values(t)))
  // MAIN and ALL span the model's whole window; one agent, or an unknown window, fits its data.
  const top = (sel === MAIN || sel === ALL) && ctxWindow > 0 ? Math.max(ctxWindow, peak) : Math.max(hasLimit ? LIMIT * 1.5 : 10_000, peak) * 1.05
  const per = top / HEIGHT
  const rowOf = (v: number) => Math.max(0, HEIGHT - 1 - Math.floor(v / per))
  // Dashed lines: 250k and 300k for agents; 70% and 80% of the window for MAIN. The later wins a shared row.
  const lines: [number, Color, string][] = hasLimit
    ? [
        [WARN, ORANGE, fmt(WARN)],
        [LIMIT, RED, fmt(LIMIT)],
      ]
    : sel === MAIN && ctxWindow > 0
      ? [
          [ctxWindow * MAIN_WARN, ORANGE, '70%'],
          [ctxWindow * MAIN_LIMIT, RED, '80%'],
        ]
      : []
  const marks = new Map<number, Color>(lines.map(([v, color]) => [rowOf(v), color]))
  const marked = new Map<number, string>(lines.map(([v, , label]) => [rowOf(v), label]))
  const grid: Cell[][] = Array.from({ length: HEIGHT }, (_, r) =>
    Array.from({ length: cols }, (): Cell => (marks.has(r) ? { ch: '┄', color: marks.get(r) } : { ch: ' ' })),
  )
  // A line per series: flat runs are ─, a climb or fall is a corner pair joined by │.
  const put = (r: number, c: number, ch: string, color: Color) => {
    const row = grid[r]
    if (row) row[c] = { ch, color }
  }
  const off = cols - pts.length
  for (const id of new Set(pts.flatMap(t => Object.keys(t)))) {
    const color = lineColor(rows, id)
    let prev: number | undefined
    pts.forEach((tick, j) => {
      const v = tick[id]
      if (v === undefined) {
        prev = undefined
        return
      }
      const r = rowOf(v)
      const c = off + j
      if (prev === undefined || prev === r) put(r, c, '─', color)
      else {
        const up = r < prev
        put(prev, c, up ? '╯' : '╮', color)
        for (let k = Math.min(r, prev) + 1; k < Math.max(r, prev); k++) put(k, c, '│', color)
        put(r, c, up ? '╭' : '╰', color)
      }
      prev = r
    })
  }
  // Each line's latest value on the y-axis, in its color, at the row it ends on; it wins over other labels.
  const latest = new Map<number, Cell>()
  for (const id of new Set(pts.flatMap(t => Object.keys(t)))) {
    const v = pts[pts.length - 1]?.[id]
    if (v !== undefined) latest.set(rowOf(v), { ch: fmt(v), color: lineColor(rows, id) })
  }
  return grid.map((cells, r) => {
    const now = latest.get(r)
    const label = now?.ch ?? (r === 0 ? fmt(Math.round(top)) : r === HEIGHT - 1 ? '0' : (marked.get(r) ?? ''))
    return [{ ch: `${label.padStart(5)} ┤`, color: now?.color ?? marks.get(r) ?? 'subtle' }, ...cells]
  })
}

// Consecutive cells of one color become one Text.
const segments = (cells: Cell[]) =>
  cells.reduce<Cell[]>((out, c) => {
    const last = out[out.length - 1]
    if (last && last.color === c.color) last.ch += c.ch
    else out.push({ ...c })
    return out
  }, [])

// Parents first, each followed by its children, with tree branches: │ ├─ └─.
const tree = (rows: AgentRow[]) => {
  const out: { row: AgentRow; branch: string }[] = []
  const walk = (parent: string | undefined, lead: string) => {
    const kids = rows.filter(r =>
      parent ? r.parentId === parent : !r.parentId || !rows.some(p => p.id === r.parentId),
    )
    kids.forEach((row, i) => {
      const isLast = i === kids.length - 1
      out.push({ row, branch: parent ? `${lead}${isLast ? '└─' : '├─'}` : '' })
      walk(row.id, parent ? `${lead}${isLast ? '  ' : '│ '}` : '')
    })
  }
  walk(undefined, '')
  return out
}

// How many 4-row bordered tiles rows the tiles wrap into at this width.
const tileRows = (tiles: [string, string, Color][], width: number) =>
  tiles.reduce(
    (acc, [value, label]) => {
      const w = Math.max(value.length, label.length) + 4
      return acc.used + w > width && acc.used > 0 ? { rows: acc.rows + 1, used: w + 1 } : { ...acc, used: acc.used + w + 1 }
    },
    { rows: 1, used: 0 },
  ).rows

// /compact for the main session, from the pane. The engine refuses it while a turn runs.
const compactMain = async ($: EngineInterface) => {
  $.ui.toast('context-guard: compacting the main session…')
  try {
    const done = await $.session.compact()
    $.ui.toast(
      done.skip !== undefined
        ? `context-guard: compaction skipped: ${done.skip}`
        : `context-guard: main session compacted${
            done.tokensBefore && done.tokensAfter ? ` (${fmt(done.tokensBefore)} → ${fmt(done.tokensAfter)})` : ''
          }`,
    )
  } catch {
    $.ui.toast('context-guard: cannot compact while Claude is working; press again when the turn ends')
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'context-guard', description: 'Chart context tokens per agent' })
    void $.ui.open({ id: PANE, title: 'Context per agent' })
    $.clock.every(TICK_MS, () => refresh($))
    return next(e)
  })

  on('command.run', { command: 'context-guard' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Context per agent' })
    return { text: 'Context chart opened.' }
  })

  // The pane's wheel and keys scroll the agent list; the window itself never moves.
  on('ui.scroll', { component: 'Pane', requestId: PANE }, async ($, e) => {
    await update($, listTop, top => Math.min(listMax, Math.max(0, top + e.by)))
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const [rows, hist, mainTokens, ctxWindow, sel, now, top] = await Promise.all([
      read($, agents),
      read($, history),
      read($, main),
      read($, modelWindow),
      read($, selected),
      $.clock.now(),
      read($, listTop),
    ])
    const width = e.props.bodyColumns ?? e.viewport?.columns ?? 80
    const total = mainTokens + rows.filter(r => !r.isDone).reduce((n, r) => n + r.tokens, 0)
    const peakOf = (id: string) => Math.max(0, ...hist.map(t => t[id] ?? 0))
    // A row shows its own series; pressed again it goes back to MAIN, and MAIN pressed again shows ALL.
    const pick = (id: string) => update($, selected, cur => (cur !== id ? id : id === MAIN ? ALL : MAIN))

    const tiles: [string, string, Color][] = [
      [fmt(mainTokens), `main ${pct(mainTokens, ctxWindow)}`.trim(), mainLevel(mainTokens, ctxWindow)],
      [`${rows.length}`, 'agents', '#a78bfa'],
      [`${rows.filter(r => !r.isDone).length}`, 'running', 'subtle'],
      [fmt(total), 'Σ windows', '#38bdf8'],
      [fmt(rows.reduce((n, r) => n + r.output, 0)), 'Σ output', GREEN],
    ]

    // One list row, one press: its own series alone on the chart, pressed again for all.
    const line = (p: {
      id: string
      branch: string
      tag: string
      tagColor: Color
      name: string
      tokens: number
      window: number
      tail: string
      isDone?: boolean
      flag?: string
    }) => {
      const isSel = sel === p.id
      const room = Math.max(4, width - 27 - 1 - p.branch.length - 2 - (p.tag.length + 2) - 1)
      const name = `${p.name}${p.flag ? ` ${p.flag}` : ''}`.slice(0, room).padEnd(room)
      return (
        <Button key={p.id} plain onPress={() => pick(p.id)}>
          <Text color={lineColor(rows, p.id)}>{isSel ? '▶' : '▎'}</Text>
          <Text dimColor>{p.branch}</Text>
          <Text color={p.isDone ? 'subtle' : GREEN}>● </Text>
          <Text backgroundColor={p.tagColor} color="#111111">{` ${p.tag} `}</Text>
          <Text bold={isSel} dimColor={p.isDone}> {name}</Text>
          <Text bold color={p.id === MAIN ? mainLevel(p.tokens, p.window) : level(p.tokens)}>
            {`${!PSEUDO[p.id] && p.tokens >= LIMIT ? '▲' : ''}${fmt(p.tokens)}`.padStart(7)}
          </Text>
          <Text dimColor>{pct(p.tokens, p.window).padStart(5)}</Text>
          <Text dimColor>{p.tail.padStart(15)}</Text>
        </Button>
      )
    }

    const selRow = rows.find(r => r.id === sel)
    const detail = PSEUDO[sel]
      ? `${PSEUDO[sel]?.label}: context ${fmt(mainTokens)} (${pct(mainTokens, ctxWindow) || '?'} of ${fmt(ctxWindow)}) · peak ${fmt(peakOf(sel))}`
      : selRow
        ? `${selRow.type} · ${selRow.name} · context ${fmt(selRow.tokens)} (${pct(selRow.tokens, selRow.window) || '?'} of ${fmt(selRow.window)}) · peak ${fmt(selRow.peak)} · ` +
          `output ${fmt(selRow.output)} · ${dur((selRow.endTime ?? now) - selRow.startTime)}` +
          `${selRow.isAlerted ? ' · over limit' : selRow.isDone ? ' · done' : ' · running'}`
        : ''

    // Everything above the agent rows is pinned; the rows get what is left of the pane's height.
    const bodyRows = e.props.scroll?.bodyRows ?? e.viewport?.rows ?? 40
    const pinned =
      1 + HEIGHT + 1 + (selRow ? 1 : 0) + (detail !== '' ? 1 : 0) + tileRows(tiles, width) * 4 + 1 + 1
    const all = tree(rows)
    const room = Math.max(3, bodyRows - pinned)
    const slots = all.length > room ? room - 1 : room
    listMax = Math.max(0, all.length - slots)
    const start = Math.min(top, listMax)
    const shown = all.slice(start, start + slots)

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold>ContextGuard</Text>
          <Button key="compact-main" label="Compact main" onPress={() => { void compactMain($) }} />
        </Box>
        <Box flexDirection="column" overflowX="scroll">
          {chartRows(hist, rows, sel, ctxWindow, width).map(cells => (
            <Text>
              {segments(cells).map(s => (
                <Text color={s.color}>{s.ch}</Text>
              ))}
            </Text>
          ))}
          <Text dimColor>
            {sel === MAIN
              ? '      └ main session, last 20 min; press an agent to see it, MAIN again for all agents'
              : sel === ALL
                ? '      └ one line per running subagent, every 5s; press MAIN to go back'
                : `      └ 0s${dur((selRow?.endTime ?? now) - (selRow?.startTime ?? now)).padStart(Math.max(10, width - 8) - 2)}`}
          </Text>
          {selRow && <Text dimColor>{'        whole run, start to finish; press its row again for MAIN'}</Text>}
        </Box>
        {detail !== '' && <Text bold color={lineColor(rows, sel)}>{detail}</Text>}

        <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
          {tiles.map(([value, label, color]) => (
            <Box key={label} borderStyle="round" borderColor={color} paddingX={1} flexDirection="column" alignItems="center">
              <Text bold color={color}>{value}</Text>
              <Text dimColor>{label}</Text>
            </Box>
          ))}
        </Box>

        <Text bold>Delegation</Text>
        {line({ id: MAIN, branch: '', tag: 'MAIN', tagColor: '#00BADE', name: 'main session', tokens: mainTokens, window: ctxWindow, tail: '' })}
        {rows.length === 0 && <Text dimColor>No subagents yet.</Text>}
        {shown.length < all.length && (
          <Text dimColor>{`rows ${start + 1}–${start + shown.length} of ${all.length} · scroll for more`}</Text>
        )}
        {shown.map(({ row, branch }) =>
          line({
            id: row.id,
            branch,
            tag: row.type,
            tagColor: chip(row.type),
            name: row.name,
            tokens: row.tokens,
            window: row.window,
            tail: `↑${fmt(row.output)} ${dur((row.endTime ?? now) - row.startTime).padStart(5)}`,
            isDone: row.isDone,
            flag: row.isAlerted ? 'over limit' : undefined,
          }),
        )}
      </Box>
    )
  })
}

import type { AgentInfo } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'context-guard',
  component: 'Pane',
  requestId: 'context-guard',
  props: { title: 'Context per agent', isFocused: false, bodyColumns: 70, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

test('the pane draws chart, tiles and an empty delegation list on every surface', async ($, on) => {
  on('clock.now', () => ({ value: 0 }))
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /main session, last 20 min/ }))?.text).toContain('main session')
    expect((await ui.find({ type: 'Text', text: /Σ windows/ }))?.text).toBe('Σ windows')
    expect((await ui.find({ type: 'Text', text: /No subagents yet/ }))?.text).toBe('No subagents yet.')
    await ui.unmount()
  }
})

test('MAIN is the default; pressing MAIN shows all agents, pressing again goes back', async ($, on) => {
  on('clock.now', () => ({ value: 0 }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /main session, last 20 min/ }))?.text).toContain('main session')
  expect(await ui.find({ type: 'Text', text: /300k ┤/ })).toBeUndefined()

  await ui.press({ key: '@main' })
  expect((await ui.find({ type: 'Text', text: /one line per running subagent/ }))?.text).toContain('one line')
  expect(await ui.find({ type: 'Text', text: /300k ┤/ })).toBeDefined()

  await ui.press({ key: '@main' })
  expect((await ui.find({ type: 'Text', text: /main session, last 20 min/ }))?.text).toContain('main session')
  await ui.unmount()
})

test('a subagent started by another agent hangs under it with tree branches', async ($, on) => {
  const agent = (id: string, parentId?: string): AgentInfo => ({
    id, parentId, tokenCount: 50_000, contextWindowSize: 200_000, description: `task ${id}`, type: 'general-purpose', kind: 'local_agent',
    status: 'running', taskStatus: 'running', label: '', startTime: 0, cwd: '/', tokenSamples: [], hasRow: true,
  })
  let ticks = 0
  on('clock.now', () => ({ value: 0 }))
  on('clock.every', () => (ticks++ === 0 ? { value: undefined } : { deny: 'one tick is enough' }))
  on('command.register', () => ({ value: { command: 'context-guard' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => ({ value: [agent('parent'), agent('kid-1', 'parent'), agent('kid-2', 'parent')] }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1000, window: 1_000_000 }, rateLimits: [] } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^├─$/ }))?.text).toBe('├─')
  expect((await ui.find({ type: 'Text', text: /^└─$/ }))?.text).toBe('└─')
  // The default view's top is the model's window (1M here), not a fixed 450k.
  expect((await ui.find({ type: 'Text', text: /1\.0M ┤/ }))?.text).toContain('1.0M ┤')
  // Each row shows its share of its own model's window: 50k of 200k.
  expect((await ui.find({ type: 'Text', text: /^\s*25%$/ }))?.text?.trim()).toBe('25%')
  await ui.unmount()
})

test('an agent climbing past 300k draws a joined line and is alerted once', async ($, on) => {
  const readings = [50_000, 600_000]
  let ticks = 0
  const toasts: string[] = []
  const agent = (tokenCount: number): AgentInfo => ({
    id: 'climber', tokenCount, description: 'climber', type: 'general-purpose', kind: 'local_agent',
    status: 'running', taskStatus: 'running', label: '', startTime: 0, cwd: '/', tokenSamples: [], hasRow: true,
  })
  on('clock.now', () => ({ value: 0 }))
  on('clock.every', () => (ticks < readings.length ? { value: undefined } : { deny: 'enough' }))
  on('command.register', () => ({ value: { command: 'context-guard' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => ({ value: [agent(readings[ticks++] ?? 0)] }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1000, window: 1_000_000 }, rateLimits: [] } }))
  on('ui.toast', (_, e) => (toasts.push(String(e.text)), { value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: '@main' }) // to the all-agents view
  expect((await ui.find({ type: 'Text', text: /╭/ }))?.text).toContain('╭')
  expect((await ui.find({ type: 'Text', text: /╯/ }))?.text).toContain('╯')
  // The line's latest value sits on the y-axis.
  expect((await ui.find({ type: 'Text', text: /600k ┤/ }))?.text).toContain('600k ┤')
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toContain('passed 300k')
  await ui.unmount()
})

test('MAIN warns once at 70% and once at 80%, and again after falling under 70%', async ($, on) => {
  const readings = [750_000, 850_000, 500_000, 720_000]
  let ticks = 0
  let tokens = 0
  const toasts: string[] = []
  on('clock.now', () => ({ value: 0 }))
  on('clock.every', () => (ticks < readings.length ? { value: undefined } : { deny: 'enough' }))
  on('command.register', () => ({ value: { command: 'context-guard' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => ((tokens = readings[ticks++] ?? 0), { value: [] }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens, window: 1_000_000 }, rateLimits: [] } }))
  on('ui.toast', (_, e) => (toasts.push(String(e.text)), { value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // The last reading (720k) shares the 70% row and takes its label; the 80% line keeps its own.
  expect((await ui.find({ type: 'Text', text: /720k ┤/ }))?.text).toContain('720k ┤')
  expect((await ui.find({ type: 'Text', text: /80% ┤/ }))?.text).toContain('80% ┤')
  expect(toasts).toHaveLength(3)
  expect(toasts[0]).toContain('main session at 75%')
  expect(toasts[1]).toContain('main session at 85%')
  expect(toasts[2]).toContain('main session at 72%')
  await ui.unmount()
})

test("a pressed agent's run starts at the chart's left edge with a 0s time axis", async ($, on) => {
  let ticks = 0
  const agent = (tokenCount: number): AgentInfo => ({
    id: 'short', tokenCount, contextWindowSize: 1_000_000, description: 'short', type: 'Explore', kind: 'local_agent',
    status: 'running', taskStatus: 'running', label: '', startTime: 0, cwd: '/', tokenSamples: [], hasRow: true,
  })
  on('clock.now', () => ({ value: 7_000 }))
  on('clock.every', () => (ticks < 2 ? { value: undefined } : { deny: 'enough' }))
  on('command.register', () => ({ value: { command: 'context-guard' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => ({ value: [agent(ticks++ === 0 ? 40_000 : 200_000)] }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1000, window: 1_000_000 }, rateLimits: [] } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'short' })
  expect((await ui.find({ type: 'Text', text: /200k ┤/ }))?.text).toContain('200k ┤')
  expect((await ui.find({ type: 'Text', text: /└ 0s\s+7s$/ }))?.text).toMatch(/└ 0s\s+7s$/)
  // Two readings over 62 columns: the line begins in the first column, right after the axis.
  const rows = await ui.findAll({ type: 'Text', text: /┤/ })
  expect(rows.some(r => /┤─/.test(r.text ?? ''))).toBe(true)
  await ui.unmount()
})

test('with 30 agents the list scrolls on its own while the chart stays put', async ($, on) => {
  let ticks = 0
  const agent = (n: number): AgentInfo => ({
    id: `a${n}`, tokenCount: 10_000 * n, contextWindowSize: 1_000_000, description: `dummy ${n}`, type: 'general-purpose',
    kind: 'local_agent', status: 'running', taskStatus: 'running', label: '', startTime: 0, cwd: '/', tokenSamples: [], hasRow: true,
  })
  on('clock.now', () => ({ value: 0 }))
  on('clock.every', () => (ticks++ === 0 ? { value: undefined } : { deny: 'enough' }))
  on('command.register', () => ({ value: { command: 'context-guard' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('agent.list', () => ({ value: Array.from({ length: 30 }, (_, i) => agent(i + 1)) }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1000, window: 1_000_000 }, rateLimits: [] } }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^rows 1–\d+ of 30/ }))?.text).toMatch(/^rows 1–\d+ of 30/)
  expect(await ui.find({ type: 'Text', text: /dummy 30/ })).toBeUndefined()

  // A mouse wheel over the pane, as the engine hands it to the plugin: well past the list's end.
  const wheel = { component: 'Pane', requestId: 'context-guard', offset: 100, by: 100, bodyRows: 40, contentRows: 40, origin: 'person' }
  expect(await $.ui.scroll(wheel as never)).toEqual({})
  // The list moved to its end; the chart and the MAIN row are still drawn.
  expect((await ui.find({ type: 'Text', text: /dummy 30/ }))?.text).toContain('dummy 30')
  expect(await ui.find({ type: 'Text', text: /^rows 1–/ })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /main session, last 20 min/ }))?.text).toContain('main session')
  expect((await ui.find({ type: 'Text', text: /^ MAIN $/ }))?.text).toBe(' MAIN ')
  await ui.unmount()
})

test('Compact main compacts the main session and says how much it freed', async ($, on) => {
  const toasts: string[] = []
  const asked: unknown[] = []
  on('clock.now', () => ({ value: 0 }))
  on('ui.toast', (_, e) => (toasts.push(String(e.text)), { value: undefined }))
  on('session.compact', (_, e) => (asked.push(e), { messages: [{ role: 'user', text: 'summary', toolUses: [] }], tokensBefore: 640_000, tokensAfter: 90_000 }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'compact-main' })
  expect(asked).toHaveLength(1)
  expect(toasts.at(-1)).toContain('main session compacted (640k → 90.0k)')
  await ui.unmount()
})

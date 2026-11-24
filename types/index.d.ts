export type AgentRow = {
  id: string
  parentId?: string
  type: string
  name: string
  tokens: number
  window: number
  output: number
  peak: number
  samples: number[]
  startTime: number
  endTime?: number
  isDone: boolean
  isAlerted: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'context-guard': {
      agents: Shaped<AgentRow[]>
      history: Shaped<Record<string, number>[]>
      main: Shaped<number>
      window: Shaped<number>
      mainAlert: Shaped<number>
      listTop: Shaped<number>
      selected: Shaped<string>
    }
  }
}

export type Turn = { id: string; q: string; a: string; meta: string; color: string; isError?: boolean }

// One excerpt and the questions asked about it; `source` is the whole message it came from.
export type Group = { id: string; excerpt: string; source: string; turns: Turn[] }

declare module 'claude-code' {
  interface PluginState {
    'side-ask': {
      groups: Group[]
      busy: string[]
      tick: number
      typingSide: boolean
    }
  }
}

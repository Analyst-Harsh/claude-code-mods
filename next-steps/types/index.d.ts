export type Step = string
export type Status = 'idle' | 'loading' | 'ready'

declare module 'claude-code' {
  interface PluginState {
    'next-steps': { steps: Step[]; isOpen: boolean; status: Status }
  }
}

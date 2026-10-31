import { expect, test } from 'claude-code/testing'

import { parseSteps } from './register'

const BAND = {
  plugin: 'next-steps',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 60,
    scroll: { offset: 0, bodyRows: 19 },
  },
} as const

const USAGE = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const TURN = { durationMs: 1, isAborted: false, reason: 'answer' }

// The fork runs unawaited after turn.complete; let its continuations settle.
const flush = () => new Promise(r => setTimeout(r, 20))

// A fork stub the test resolves by hand.
const forkStub = () => {
  let resolve = (_: string) => {}
  const calls: string[] = []
  const hook = (_: unknown, e: { prompt: string }) => {
    calls.push(e.prompt)
    return new Promise(r => {
      resolve = text => r({ value: { isAnswered: true, text, usage: USAGE } })
    })
  }
  return { hook, calls, answer: (text: string) => resolve(text) }
}

test('parseSteps', () => {
  expect(parseSteps('{"steps":["Run the tests","Commit"]}')).toEqual(['Run the tests', 'Commit'])
  expect(parseSteps('Sure:\n{"steps":[" Open a PR "]}\nDone')).toEqual(['Open a PR'])
  expect(parseSteps('not json')).toEqual([])
  expect(parseSteps('{"steps": nope}')).toEqual([])
  expect(parseSteps('{"steps":["a","b","c","d"]}')).toEqual(['a', 'b', 'c'])
  expect(parseSteps('{"steps":["a",3,null,""]}')).toEqual(['a'])
})

test('loading, then steps with chips numbered after them; a press fills the prompt', async ($, on) => {
  const fork = forkStub()
  const filled: string[] = []
  on('model.fork', fork.hook as never)
  on('prompt.fill', (_, e) => {
    filled.push(e.text)
    return { isFilled: true, text: e.text, cursor: e.text.length }
  })
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))

  // The reply mentions the old tag in prose: it must reach the fork whole.
  await $.turn.complete({ ...TURN, answer: 'Mentions `<next>` in prose.', turnId: 't1' } as never)
  expect(fork.calls[0]).toContain('Mentions `<next>` in prose.')

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' } as never)
  expect(await ui.find({ type: 'Text', text: /⋯/ })).toBeDefined()

  fork.answer('{"steps":["Run the tests","Commit","Open a PR"]}')
  await flush()
  expect((await ui.find({ key: 'step-2' }))?.props.hotkey).toBe('3')
  expect((await ui.find({ key: 'chip-yes' }))?.props.hotkey).toBe('4')
  expect((await ui.find({ key: 'chip-explain' }))?.props.hotkey).toBe('5')

  await ui.press({ key: 'toggle' })
  expect(await ui.find({ type: 'Text', text: /yes, proceed/ })).toBeUndefined()
  await ui.press({ key: 'toggle' })

  await ui.press({ key: 'step-0' })
  expect(filled).toEqual(['Run the tests'])
  expect(await ui.find({ type: 'Text', text: /next steps/ })).toBeUndefined()
  await ui.unmount()
})

test('a fork that lands after the next prompt is dropped', async ($, on) => {
  const fork = forkStub()
  on('model.fork', fork.hook as never)
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('prompt.submit', (_, e) => ({ text: e.text }) as never)
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))

  await $.turn.complete({ ...TURN, answer: 'Done.', turnId: 't1' } as never)
  await $.prompt.submit({ text: 'next thing' } as never)
  fork.answer('{"steps":["Stale step"]}')
  await flush()

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' } as never)
  expect(await ui.find({ type: 'Text', text: /Stale step|next steps/ })).toBeUndefined()
  await ui.unmount()
})

test('no steps, no band; a subagent turn does not fork', async ($, on) => {
  const fork = forkStub()
  on('model.fork', fork.hook as never)
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'engine' }))

  await $.turn.complete({ ...TURN, answer: 'Report.', turnId: 'a1', agentId: 'agent-1' } as never)
  expect(fork.calls.length).toBe(0)

  await $.turn.complete({ ...TURN, answer: 'Done.', turnId: 't1' } as never)
  expect(fork.calls.length).toBe(1)
  fork.answer('{"steps":[]}')
  await flush()

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' } as never)
  expect(await ui.find({ type: 'Text', text: /next steps/ })).toBeUndefined()
  await ui.unmount()
})

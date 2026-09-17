import express from 'express'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { afterAll, beforeAll, expect, test } from 'vitest'
import sessions from '../src/routes/sessions.js'
import subagents from '../src/routes/subagents.js'
import { paths } from '../src/config/paths.js'

let server: Server
let base: string
const project = '-fixture-project'
const session = '11111111-1111-1111-1111-111111111111'
const response = (usage: object, content: object[], id: unknown = 'response-1') => ({
  type: 'assistant', timestamp: '2026-09-17T10:00:01Z',
  message: { id, model: 'fixture-model', usage, content },
})
const lines = [
  { type: 'user', timestamp: '2026-09-17T10:00:00Z', message: { content: 'Hello' } },
  response({ input_tokens: 10, output_tokens: 1, cache_creation_input_tokens: 20 }, [{ type: 'text', text: 'First' }]),
  response({ input_tokens: 30, output_tokens: 1, cache_read_input_tokens: 40,
    cache_creation_input_tokens: 50, cache_creation: { ephemeral_1h_input_tokens: 15, ephemeral_5m_input_tokens: 35 } },
  [{ type: 'tool_use', id: 'tool-1', name: 'Read', input: { file_path: '/fixture' } }]),
  response({ output_tokens: 425, output_tokens_details: { thinking_tokens: 100 } }, [{ type: 'text', text: 'Done' }]),
  response({ input_tokens: 999, output_tokens: 999 }, [], ''),
  { type: 'progress', message: { id: 'ignored', usage: { output_tokens: 999 } } },
]

beforeAll(async () => {
  const dir = join(paths.projects, project)
  await mkdir(join(dir, session, 'subagents'), { recursive: true })
  const transcript = lines.map(line => JSON.stringify(line)).join('\n') + '\nmalformed assistant\n'
  await writeFile(join(dir, `${session}.jsonl`), transcript)
  await writeFile(join(dir, session, 'subagents', 'agent-first.jsonl'), transcript)
  await writeFile(join(dir, session, 'subagents', 'agent-second.jsonl'), transcript)
  const app = express()
  app.use('/api/sessions', sessions)
  app.use('/api/subagents', subagents)
  server = await new Promise<Server>(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening))
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing test port')
  base = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
})

test.each([
  `/api/sessions/${project}/${session}`,
  `/api/subagents/${project}/${session}/first`,
])('deduplicates local usage through HTTP: %s', async path => {
  const res = await fetch(base + path)
  expect(res.status).toBe(200)
  const detail = await res.json()
  expect(detail.totalOutputTokens).toBe(425)
  expect(detail.totalInputTokens).toBe(120)
  expect(detail.messageCount).toBe(5)
  expect(detail.model).toBe('fixture-model')
  expect(detail.toolsUsed).toEqual(['Read'])
  expect(detail.messages[1]).toMatchObject({ inputTokens: 120, outputTokens: 425 })
  for (const message of detail.messages.slice(2)) {
    expect(message).not.toHaveProperty('inputTokens')
    expect(message).not.toHaveProperty('outputTokens')
  }
  expect(detail.messages[1].content).toEqual([{ type: 'text', text: 'First' }])
  expect(detail.messages[3].content).toEqual([{ type: 'text', text: 'Done' }])
})

test('sub-agent list counts each response once in each separate file', async () => {
  const res = await fetch(base + '/api/subagents')
  expect(res.status).toBe(200)
  const agents = await res.json()
  expect(agents).toHaveLength(2)
  for (const agent of agents) {
    expect(agent).toMatchObject({ totalInputTokens: 120, totalOutputTokens: 425,
      messageCount: 6, model: 'fixture-model', toolsUsed: ['Read'] })
  }
})

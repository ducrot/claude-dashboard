import { COUNT_FIELDS, SCALAR_FIELDS, type PartialRecord } from './transcript.js'
import type { FileState } from './indexer.js'

export const SCHEMA_VERSION = 1

/** A shared string table covers paths, IDs and all scalar/tool values; derived rows and prices never enter the cache. */
export function encodeCache(projectsDir: string, states: Map<string, FileState>, files: Map<string, Map<string, PartialRecord>>): string {
  const strings: string[] = []
  const ids = new Map<string, number>()
  const intern = (value: string) => {
    let id = ids.get(value)
    if (id === undefined) { id = strings.length; strings.push(value); ids.set(value, id) }
    return id
  }
  const candidate = (value: string, c: { at: number; offset: number; file: string }) =>
    [intern(value), c.at === Infinity ? null : c.at, c.offset, intern(c.file)]
  const entries = [...states].map(([file, state]) => [intern(file), state, [...(files.get(file)?.values() ?? [])].map(r => ({
    ...r, id: intern(r.id),
    scalars: Object.fromEntries(Object.entries(r.scalars).map(([key, c]) => [key, candidate(c.value, c)])),
    tools: [...r.tools].map(([id, c]) => [intern(id), candidate(c.name, c)]),
  }))])
  return JSON.stringify({ schemaVersion: SCHEMA_VERSION, projectsDir, strings, files: entries })
}

/** Validate the entire payload before exposing any state to the indexer. */
export function decodeCache(text: string, projectsDir: string) {
  const data = JSON.parse(text)
  const fail = (): never => { throw new Error('Invalid usage cache') }
  if (data.schemaVersion !== SCHEMA_VERSION || data.projectsDir !== projectsDir || !Array.isArray(data.strings) || !data.strings.every((s: unknown) => typeof s === 'string') || !Array.isArray(data.files)) fail()
  const str = (id: unknown): string => typeof id === 'number' && Number.isInteger(id) && id >= 0 && id < data.strings.length ? data.strings[id] : fail()
  const number = (n: unknown): number => typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : fail()
  const time = (n: unknown): number => typeof n === 'number' && Number.isFinite(n) ? n : fail()
  const candidate = (c: any) => {
    if (!Array.isArray(c) || c.length !== 4) fail()
    return { value: str(c[0]), at: c[1] === null ? Infinity : time(c[1]), offset: number(c[2]), file: str(c[3]) }
  }
  const states = new Map<string, FileState>()
  const files = new Map<string, Map<string, PartialRecord>>()
  for (const [key, state, records] of data.files) {
    const file = str(key)
    if (states.has(file) || file.startsWith('/') || file.split('/').some((s: string) => s === '..') || !file.endsWith('.jsonl')) fail()
    for (const field of ['size', 'mtimeMs', 'ino', 'offset'] satisfies (keyof FileState)[]) number(state[field])
    if (state.offset > state.size || !Number.isInteger(state.offset) || ![state.headHash, state.tailHash].every(h => typeof h === 'string' && /^[a-f0-9]{40}$/.test(h)) || !Array.isArray(records)) fail()
    const partials = new Map<string, PartialRecord>()
    for (const r of records) {
      const id = str(r.id)
      if (partials.has(id) || typeof r.isSidechain !== 'boolean' || !r.scalars || !Array.isArray(r.tools)) fail()
      for (const field of COUNT_FIELDS) number(r[field])
      if (r.ts !== null) time(r.ts)
      const scalars: PartialRecord['scalars'] = {}
      for (const field of Object.keys(r.scalars)) {
        if (!SCALAR_FIELDS.includes(field as typeof SCALAR_FIELDS[number])) fail()
        scalars[field as typeof SCALAR_FIELDS[number]] = candidate(r.scalars[field])
      }
      const tools: PartialRecord['tools'] = new Map()
      for (const [key, raw] of r.tools) {
        const c = candidate(raw)
        tools.set(str(key), { name: c.value, at: c.at, offset: c.offset, file: c.file })
      }
      partials.set(id, { ...r, id, scalars, tools })
    }
    states.set(file, state); files.set(file, partials)
  }
  return { states, files }
}

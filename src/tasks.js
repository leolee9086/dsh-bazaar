import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { recoverTask } from './protocol.js'

/** Task identity and diagnostics belong to the profile, not a mounted React view. */
export class TaskStore {
  constructor(dir, { taskLimit = 100, logBytes = 128 * 1024 } = {}) {
    this.dir = dir
    this.file = join(dir, 'tasks.json')
    this.tasks = new Map()
    this.taskLimit = taskLimit
    this.logBytes = logBytes
    this.writing = Promise.resolve()
  }

  async load() {
    let text
    try { text = await readFile(this.file, 'utf8') }
    catch (error) { if (error.code === 'ENOENT') return; throw error }
    const rows = JSON.parse(text)
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row.requestId !== 'string'
      || typeof row.done !== 'boolean' || !Array.isArray(row.log))) throw new Error('Invalid bazaar task journal')
    for (const row of rows.slice(-this.taskLimit)) this.tasks.set(row.requestId, recoverTask(row))
    await this.save()
  }

  get(id) { return this.tasks.get(id) ?? null }
  list() { return [...this.tasks.values()] }
  latest() { return this.list().at(-1) ?? null }
  busy() { return this.list().find(task => !task.done) ?? null }

  add(task) {
    if (this.busy()) throw new Error('Another installation task is active')
    this.tasks.set(task.requestId, task)
    while (this.tasks.size > this.taskLimit) this.tasks.delete(this.tasks.keys().next().value)
  }

  /** Bound the complete retained text, including an oversized single chunk. */
  append(task, stream, text) {
    if (!text) return
    const bytes = Buffer.from(text)
    if (bytes.length > this.logBytes) task.logTruncated = true
    // Skip continuation bytes at the cut point rather than introducing U+FFFD.
    let start = Math.max(0, bytes.length - this.logBytes)
    while (start < bytes.length && (bytes[start] & 0xc0) === 0x80) start += 1
    task.log.push({ stream, text: bytes.subarray(start).toString('utf8') })
    let total = task.log.reduce((sum, row) => sum + Buffer.byteLength(row.text), 0)
    while (total > this.logBytes && task.log.length > 1) {
      total -= Buffer.byteLength(task.log.shift().text)
      task.logTruncated = true
    }
    if (total > this.logBytes) {
      task.log[0].text = Buffer.from(task.log[0].text).subarray(-this.logBytes).toString('utf8')
      task.logTruncated = true
    }
  }

  /** Serialize snapshots so an older write can never replace a newer result. */
  save() {
    const text = `${JSON.stringify(this.list())}\n`
    const operation = this.writing.then(async () => {
      await mkdir(this.dir, { recursive: true })
      const temporary = `${this.file}.tmp`
      await writeFile(temporary, text, { mode: 0o600 })
      await rename(temporary, this.file)
    })
    this.writing = operation.catch(() => { /* The initiating caller observes the failure. */ })
    return operation
  }
}

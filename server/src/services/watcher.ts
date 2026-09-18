import { relative, isAbsolute, sep } from 'node:path'
import { watch } from 'chokidar'
import { EventEmitter } from 'events'
import { paths } from '../config/paths.js'
import { invalidateSubAgentsCache } from './subagents.js'

export interface FileChangeEvent {
  type: 'plans' | 'tasks' | 'todos' | 'stats' | 'sessions' | 'memory' | 'subagents' | 'usage'
  path: string
}

export class FileWatcher extends EventEmitter {
  private watcher: ReturnType<typeof watch> | null = null

  start() {
    if (this.watcher) return

    const watchPaths = [
      paths.projects, // Include directory deletion events as well as matching files.
      `${paths.plans}/**/*.md`,
      `${paths.tasks}/**/*.json`,
      `${paths.todos}/**/*.json`,
      paths.statsCache,
      `${paths.projects}/**/sessions-index.json`,
      `${paths.projects}/**/memory/*.md`,
      `${paths.projects}/**/*.jsonl`,
    ]

    this.watcher = watch(watchPaths, {
      ignoreInitial: true,
      persistent: true,
    })

    this.watcher.on('add', (path) => this.handleChange(path))
    this.watcher.on('change', (path) => this.handleChange(path))
    this.watcher.on('unlink', (path) => this.handleChange(path))

    this.watcher.on('unlinkDir', (path) => this.notifyTranscript(path, true))

    console.log('File watcher started')
  }

  private notifyTranscript(filePath: string, directory = false) {
    const path = relative(paths.projects, filePath)
    if (path && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path) && (directory || path.endsWith('.jsonl'))) {
      this.emit('transcript', filePath)
    }
  }

  private handleChange(filePath: string) {
    this.notifyTranscript(filePath)
    let type: FileChangeEvent['type']

    if (filePath.includes('/plans/')) {
      type = 'plans'
    } else if (filePath.includes('/subagents/')) {
      type = 'subagents'
    } else if (filePath.includes('/tasks/')) {
      type = 'tasks'
    } else if (filePath.includes('/todos/')) {
      type = 'todos'
    } else if (filePath.includes('/memory/')) {
      type = 'memory'
    } else if (filePath.includes('stats-cache.json')) {
      type = 'stats'
    } else if (filePath.includes('sessions-index.json')) {
      type = 'sessions'
    } else {
      return
    }

    if (type === 'subagents') {
      invalidateSubAgentsCache()
    }

    this.emit('change', { type, path: filePath })
  }

  stop() {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
      console.log('File watcher stopped')
    }
  }
}

export const fileWatcher = new FileWatcher()

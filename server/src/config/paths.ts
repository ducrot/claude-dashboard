import { fileURLToPath } from 'node:url'
import { homedir } from 'os'
import { join } from 'path'

const CLAUDE_DIR = join(homedir(), '.claude')

export const paths = {
  usageCacheFile: fileURLToPath(new URL('../../.cache/usage-index.json', import.meta.url)),
  claude: CLAUDE_DIR,
  plans: join(CLAUDE_DIR, 'plans'),
  tasks: join(CLAUDE_DIR, 'tasks'),
  todos: join(CLAUDE_DIR, 'todos'),
  projects: join(CLAUDE_DIR, 'projects'),
}

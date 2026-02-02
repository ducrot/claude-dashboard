import { homedir } from 'os'
import { join } from 'path'

const CLAUDE_DIR = join(homedir(), '.claude')

export const paths = {
  claude: CLAUDE_DIR,
  plans: join(CLAUDE_DIR, 'plans'),
  tasks: join(CLAUDE_DIR, 'tasks'),
  todos: join(CLAUDE_DIR, 'todos'),
  statsCache: join(CLAUDE_DIR, 'stats-cache.json'),
  projects: join(CLAUDE_DIR, 'projects'),
}

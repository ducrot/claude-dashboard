import { listPlans, getPlan } from './plans.js'
import { listTasks } from './tasks.js'
import { listTodos } from './todos.js'

export interface SearchResult {
  type: 'plan' | 'task' | 'todo'
  id: string
  title: string
  snippet: string
  path?: string
}

function extractSnippet(content: string, query: string, maxLength: number = 150): string {
  const lowerContent = content.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const index = lowerContent.indexOf(lowerQuery)

  if (index === -1) {
    return content.slice(0, maxLength) + (content.length > maxLength ? '...' : '')
  }

  const start = Math.max(0, index - 50)
  const end = Math.min(content.length, index + query.length + 100)
  let snippet = content.slice(start, end)

  if (start > 0) snippet = '...' + snippet
  if (end < content.length) snippet = snippet + '...'

  return snippet
}

export async function search(query: string): Promise<SearchResult[]> {
  const results: SearchResult[] = []
  const lowerQuery = query.toLowerCase()

  // Search plans
  const plans = await listPlans()
  for (const plan of plans) {
    if (
      plan.title.toLowerCase().includes(lowerQuery) ||
      plan.filename.toLowerCase().includes(lowerQuery)
    ) {
      const fullPlan = await getPlan(plan.filename)
      results.push({
        type: 'plan',
        id: plan.filename,
        title: plan.title,
        snippet: fullPlan
          ? extractSnippet(fullPlan.content, query)
          : plan.title,
      })
    } else {
      // Check content for match
      const fullPlan = await getPlan(plan.filename)
      if (fullPlan && fullPlan.content.toLowerCase().includes(lowerQuery)) {
        results.push({
          type: 'plan',
          id: plan.filename,
          title: plan.title,
          snippet: extractSnippet(fullPlan.content, query),
        })
      }
    }
  }

  // Search tasks
  const tasks = await listTasks()
  for (const task of tasks) {
    if (
      task.subject.toLowerCase().includes(lowerQuery) ||
      task.description.toLowerCase().includes(lowerQuery)
    ) {
      results.push({
        type: 'task',
        id: task.id,
        title: task.subject,
        snippet: extractSnippet(task.description || task.subject, query),
      })
    }
  }

  // Search todos
  const todos = await listTodos()
  for (const todo of todos) {
    const matchingItems = todo.items.filter((item) =>
      item.content.toLowerCase().includes(lowerQuery)
    )

    if (matchingItems.length > 0) {
      results.push({
        type: 'todo',
        id: todo.sessionId,
        title: `Todo list (${todo.items.length} items)`,
        snippet: extractSnippet(matchingItems[0].content, query),
      })
    }
  }

  // Limit results
  return results.slice(0, 20)
}

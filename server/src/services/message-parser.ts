export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result'
  text?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  content?: string
}

export function parseMessageContent(message: { role: string; content: unknown }): ContentBlock[] {
  const content = message.content
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }]
  }
  if (Array.isArray(content)) {
    return content.map((block: Record<string, unknown>) => {
      if (block.type === 'text') {
        return { type: 'text' as const, text: block.text as string }
      }
      if (block.type === 'tool_use') {
        return {
          type: 'tool_use' as const,
          name: block.name as string,
          tool_use_id: block.id as string,
          input: block.input,
        }
      }
      if (block.type === 'tool_result') {
        const resultContent = block.content
        let text = ''
        if (typeof resultContent === 'string') {
          text = resultContent
        } else if (Array.isArray(resultContent)) {
          text = resultContent
            .filter((b: Record<string, unknown>) => b.type === 'text')
            .map((b: Record<string, unknown>) => b.text)
            .join('\n')
        }
        return {
          type: 'tool_result' as const,
          tool_use_id: block.tool_use_id as string,
          content: text,
        }
      }
      return { type: 'text' as const, text: JSON.stringify(block) }
    })
  }
  return []
}

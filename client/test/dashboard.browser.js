// Pass this function to playwright-cli run-code on the user-started dev server.
async page => {
  const errors = []
  const onConsole = message => { if (message.type() === 'error') errors.push(message.text()) }
  const onPageError = error => errors.push(String(error))
  page.on('console', onConsole)
  page.on('pageerror', onPageError)
  const check = (condition, message) => { if (!condition) throw new Error(message) }
  const origin = 'http://localhost:5174'
  const oldTheme = await page.evaluate(() => localStorage.getItem('theme'))
  try {
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => localStorage.setItem('theme', theme), theme)
      await page.goto(origin)
      await page.getByRole('heading', { name: 'API Requests', exact: true }).waitFor()
      check(await page.locator('html').getAttribute('class') === theme, `Theme ${theme} not applied`)
      for (const title of ['Total Sessions', 'API Requests', 'Tool Calls', 'Output Tokens', 'Avg Requests/Session', 'Avg Tool Calls/Session', 'Most Active Day', 'Peak Hour']) {
        check(await page.getByRole('heading', { name: title, exact: true }).count() === 1, `Missing card ${title}`)
      }
      const models = page.getByRole('list', { name: 'Model output tokens' })
      for (const name of ['Opus 5', 'Sonnet 5', 'Fable 5.1']) check(await models.getByText(name, { exact: true }).count() === 1, `Missing ${name}`)
      check(await page.getByText('Output tokens · last 30 days', { exact: true }).count() === 1, 'Missing model range')
      check(await page.locator('.recharts-pie').count() === 0, 'Legacy pie remains')
      check(await page.locator('.recharts-line').count() === 2, 'Daily requests/tool lines missing')
      const descriptions = await page.locator('main p').allTextContents()
      check(descriptions.filter(text => /^.+ requests$/.test(text)).length === 2, 'Insights must describe requests')
      await page.getByRole('link', { name: 'View usage', exact: true }).click()
      await page.waitForURL('**/usage')
    }
    // Deterministic regression for the initial state and automatic building -> ready polling.
    const response = await page.request.get(`${origin}/api/stats`)
    const ready = await response.json()
    let polls = 0
    await page.route('**/api/stats', route => {
      polls++
      return route.fulfill({ json: polls <= 2 ? { ...ready, index: { ...ready.index, state: 'building', filesIndexed: polls * 2, filesTotal: 10 } } : ready })
    })
    await page.goto(origin)
    await page.getByText('Building usage index…', { exact: true }).waitFor()
    check(await page.getByRole('progressbar').getAttribute('max') === '10', 'Progress maximum missing')
    check(await page.getByRole('progressbar').getAttribute('value') === '2', 'Progress count missing')
    check(await page.getByRole('heading', { name: 'API Requests', exact: true }).count() === 0, 'Partial charts shown while building')
    await page.waitForFunction(() => document.querySelector('progress')?.value === 4)
    await page.getByRole('heading', { name: 'API Requests', exact: true }).waitFor({ timeout: 10000 })
    check(polls >= 3, 'Dashboard did not poll while building')
    // ISSUE-008 owns only this recorded pre-existing SSE error.
    const unexpected = errors.filter(message => !message.startsWith('SSE error:'))
    check(unexpected.length === 0, `Unexpected browser errors: ${unexpected.join('; ')}`)
    return { result: 'PASS', themes: ['light', 'dark'], cards: 8, models: ['Opus 5', 'Sonnet 5', 'Fable 5.1'], usageLink: 'PASS', buildingProgressAndPolling: 'PASS (controlled responses)', polls, consoleErrors: errors }
  } finally {
    await page.unroute('**/api/stats')
    await page.evaluate(theme => theme === null ? localStorage.removeItem('theme') : localStorage.setItem('theme', theme), oldTheme)
    page.off('console', onConsole)
    page.off('pageerror', onPageError)
  }
}

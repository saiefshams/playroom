import { expect, test, type Page } from '@playwright/test'

async function overflows(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
}

test('the lobby fits a phone and a desktop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByTestId('app-ready')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Connect 4' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Chess' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Ribbon Rally' })).toBeVisible()
  expect(await overflows(page)).toBe(false)

  await page.setViewportSize({ width: 1280, height: 800 })
  expect(await overflows(page)).toBe(false)
})

test('a phone can open a chess room without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByTestId('player-name').fill('Ada')
  await page.getByTestId('create-chess').click()
  await expect(page.getByTestId('chess-board')).toBeVisible()
  await expect(page.getByTestId('sq-e2')).toBeVisible()
  expect(await overflows(page)).toBe(false)
})

test('two players and a watcher finish connect 4', async ({ browser }) => {
  const adaContext = await browser.newContext()
  const graceContext = await browser.newContext()
  const linContext = await browser.newContext()
  await adaContext.grantPermissions(['clipboard-read', 'clipboard-write'])
  const ada = await adaContext.newPage()
  const grace = await graceContext.newPage()
  const lin = await linContext.newPage()

  await ada.goto('/')
  await ada.getByTestId('player-name').fill('Ada')
  await ada.getByTestId('create-connect4').click()
  await expect(ada.getByTestId('status-line')).toHaveText('Waiting for an opponent.')
  const code = (await ada.getByTestId('room-code').textContent())?.trim() ?? ''
  expect(code).toMatch(/^[A-Z0-9]{6}$/)
  await ada.getByTestId('copy-code').click()
  await expect.poll(() => ada.evaluate(() => navigator.clipboard.readText())).toContain(`/room/${code}`)

  await grace.goto('/')
  await grace.getByTestId('player-name').fill('Grace')
  await grace.getByTestId('join-code').fill(code)
  await grace.getByTestId('join-room').click()
  await expect(grace.getByTestId('status-line')).toHaveText("Ada's turn.")

  await lin.goto(`/?ignored`)
  await lin.getByTestId('player-name').fill('Lin')
  await lin.getByTestId('join-code').fill(`http://127.0.0.1:5173/room/${code}`)
  await lin.getByTestId('watch-room').click()
  await expect(lin.getByTestId('watch-banner')).toBeVisible()
  await expect(lin.getByTestId('col-0')).toBeDisabled()

  for (const [index, column] of [0, 1, 0, 1, 0, 1, 0].entries()) {
    const seat = index % 2 === 0 ? ada : grace
    const cell = seat.getByTestId(`col-${column}`)
    await expect(cell).toBeEnabled()
    await cell.click()
  }

  await expect(ada.getByTestId('status-line')).toHaveText('Ada wins.')
  await expect(grace.getByTestId('status-line')).toHaveText('Ada wins.')
  await expect(lin.getByTestId('move-log')).toContainText('column 1')
  await expect(lin.getByTestId('status-line')).toHaveText('Ada wins.')

  await ada.getByTestId('chat-input').fill('nice stack')
  await ada.getByTestId('chat-send').click()
  await expect(grace.getByTestId('chat-log')).toContainText('nice stack')

  await adaContext.close()
  await graceContext.close()
  await linContext.close()
})

test('a chess clock and a shared move stay in sync', async ({ browser }) => {
  const adaContext = await browser.newContext()
  const graceContext = await browser.newContext()
  const ada = await adaContext.newPage()
  const grace = await graceContext.newPage()
  await ada.goto('/')
  await ada.getByTestId('player-name').fill('Ada')
  await ada.getByTestId('clock-5-0').click()
  await ada.getByTestId('create-chess').click()
  await expect(ada.getByTestId('clocks')).toContainText('5:00')
  const code = (await ada.getByTestId('room-code').textContent())?.trim() ?? ''

  await grace.goto('/')
  await grace.getByTestId('player-name').fill('Grace')
  await grace.getByTestId('join-code').fill(code)
  await grace.getByTestId('join-room').click()
  await ada.getByTestId('sq-e2').click()
  await ada.getByTestId('sq-e4').click()
  await expect(ada.getByTestId('sq-e4')).toHaveAttribute('data-piece', 'wp')
  await expect(grace.getByTestId('sq-e4')).toHaveAttribute('data-piece', 'wp')
  await expect(ada.getByTestId('sq-e2')).toHaveAttribute('data-piece', '')
  await expect(grace.getByTestId('status-line')).toHaveText('Your turn.')

  await adaContext.close()
  await graceContext.close()
})

test('the easy CPU answers a connect 4 drop', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('player-name').fill('Ada')
  await page.getByTestId('diff-connect4-easy').click()
  await page.getByTestId('cpu-connect4').click()
  await expect(page.getByTestId('status-line')).toHaveText('Your turn.')
  await page.getByTestId('col-3').click()
  await expect(page.getByTestId('move-log')).toContainText('2.', { timeout: 8_000 })
  await expect(page.getByTestId('status-line')).toHaveText('Your turn.')
})

test('ribbon cars follow the cursor on desktop and a phone', async ({ browser }) => {
  const adaContext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const graceContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const ada = await adaContext.newPage()
  const grace = await graceContext.newPage()

  await ada.goto('/')
  await ada.getByTestId('player-name').fill('Ada')
  await ada.getByTestId('create-color-0').click()
  await ada.getByTestId('create-ribbon').click()
  const floor = ada.getByTestId('ribbon-floor')
  await expect(floor).toBeVisible()
  await expect.poll(() => floor.getAttribute('data-local-x')).not.toBeNull()
  const before = await floor.getAttribute('data-local-x')
  const box = await floor.boundingBox()
  if (!box) throw new Error('The floor has no box')
  await ada.mouse.move(box.x + box.width * 0.22, box.y + box.height * 0.3)
  await ada.mouse.move(box.x + box.width * 0.74, box.y + box.height * 0.62)
  await expect.poll(() => floor.getAttribute('data-local-x')).not.toBe(before)

  const code = (await ada.getByTestId('room-code').textContent())?.trim() ?? ''
  await grace.goto('/')
  await grace.getByTestId('player-name').fill('Grace')
  await grace.getByTestId('join-code').fill(code)
  await grace.getByTestId('join-color-1').click()
  await grace.getByTestId('join-room').click()
  await expect.poll(() => grace.getByTestId('ribbon-floor').getAttribute('data-peer-count')).toBe('1')
  expect(await overflows(grace)).toBe(false)

  await adaContext.close()
  await graceContext.close()
})

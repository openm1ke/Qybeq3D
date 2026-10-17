import { expect, test, type Page } from '@playwright/test'

async function declineAnalytics(page: Page) {
  const dialog = page.getByRole('dialog', { name: /help improve qybeq/i })
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: /not now/i }).click()
}

/** Main menu → Play → Roll Dice → skip the roll. Returns the blocked labels. */
async function startPuzzle(page: Page): Promise<string[]> {
  await page.goto('./')
  await declineAnalytics(page)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByText('Roll to set the puzzle')).toBeVisible()
  await page.getByRole('button', { name: 'Roll Dice' }).click()
  await expect(page.locator('.dice-roll-layer')).toBeVisible()
  await page.locator('.dice-roll-layer').click()
  await expect(page.locator('.dice-roll-layer')).toHaveCount(0)
  await expect(page.getByText('Fill every free cell')).toBeVisible()
  return page.locator('.board-grid .tile-art').evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute('aria-label') ?? ''))
}

test('opens the mobile main menu without horizontal overflow', async ({ page }) => {
  await page.goto('./')
  await declineAnalytics(page)
  const daily = await page.getByRole('button', { name: /daily challenge/i }).boundingBox()
  const play = await page.getByRole('button', { name: 'Play', exact: true }).boundingBox()
  expect(daily?.y).toBeLessThan(play?.y ?? 0)
  for (const shortcut of ['How to Play', 'Customize', 'Settings']) {
    await expect(page.getByRole('button', { name: shortcut })).toBeVisible()
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('rolls six 3D coordinate dice into a solvable puzzle', async ({ page }) => {
  await page.goto('./')
  await declineAnalytics(page)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.getByRole('button', { name: 'Roll Dice' }).click()
  await expect(page.locator('.roll-die3d')).toHaveCount(6)
  // Perspective faces are placed with the painter's own projection matrix.
  await expect(page.locator('.roll-face[style*="matrix3d"]').first()).toBeAttached()
  await expect(page.locator('.dice-roll-layer')).toHaveCount(0, { timeout: 4000 })
  const labels = await page.locator('.board-grid .tile-art').evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute('aria-label')))
  expect(labels.map((label) => label?.[0]).sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
  await expect(page.locator('.tray-piece')).toHaveCount(8)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('drags a piece onto the board and it snaps into the grid', async ({ page }) => {
  const blocked = new Set(await startPuzzle(page))
  const grid = await page.locator('.board-grid').boundingBox()
  if (!grid) throw new Error('Board geometry is unavailable')
  const cell = grid.width / 6
  let target: { row: number; col: number } | null = null
  for (let row = 0; row < 5 && !target; row += 1) {
    for (let col = 0; col < 5 && !target; col += 1) {
      const cells = [[row, col], [row, col + 1], [row + 1, col], [row + 1, col + 1]]
      if (cells.every(([r, c]) => !blocked.has(`${String.fromCharCode(65 + r)}${c + 1}`))) target = { row, col }
    }
  }
  if (!target) throw new Error('No free 2×2 area')
  const box = await page.locator('[data-piece="square"]').boundingBox()
  if (!box) throw new Error('Tray geometry is unavailable')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(grid.x + (target.col + 1) * cell, grid.y + (target.row + 1) * cell, { steps: 12 })
  await expect(page.locator('.drag-overlay')).toBeVisible()
  await page.mouse.up()
  await expect(page.locator('.placed-piece')).toHaveCount(1)
  await page.waitForTimeout(300)
  const placed = await page.locator('.placed-piece').boundingBox()
  expect(Math.abs((placed?.x ?? 0) - (grid.x + target.col * cell))).toBeLessThan(2)
  expect(Math.abs((placed?.y ?? 0) - (grid.y + target.row * cell))).toBeLessThan(2)
})

test('rotates a tray piece clockwise on tap without moving the tray', async ({ page }) => {
  await startPuzzle(page)
  const line = page.locator('[data-piece="line4"]')
  // Let the tray's entrance (a short slide-up) finish first.
  await expect(page.locator('.tray-slot').first()).not.toHaveAttribute('style', /translateY/)
  const before = await page.locator('.tray-slot').first().boundingBox()
  await expect(line).toHaveAttribute('aria-label', /0°/)
  await line.click()
  await expect(line).toHaveAttribute('aria-label', /90°/)
  expect(await page.locator('.tray-slot').first().boundingBox()).toEqual(before)
})

test('keyboard letters work in any layout', async ({ page }) => {
  await startPuzzle(page)
  const line = page.locator('[data-piece="line4"]')
  await expect(page.locator('.tray-slot').first()).not.toHaveAttribute('style', /translateY/)
  await line.focus()
  // R on a Russian layout types «к»; the physical key still rotates.
  await line.dispatchEvent('keydown', { key: 'к', code: 'KeyR', bubbles: true })
  await expect(line).toHaveAttribute('aria-label', /90°/)
})

test('shows a dashed hint outline and counts hints down', async ({ page }) => {
  await startPuzzle(page)
  await page.getByRole('button', { name: /3 hints left/i }).click()
  await expect(page.getByText(/place it on the outline|move it to the outline/i)).toBeVisible()
  await expect(page.locator('.hint-layer')).toBeVisible()
  await expect(page.getByRole('button', { name: /2 hints left/i })).toBeVisible()
})

test('pauses from the game menu and returns to the main menu', async ({ page }) => {
  await startPuzzle(page)
  await page.getByRole('button', { name: 'Game menu' }).click()
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible()
  await page.getByRole('button', { name: 'Main Menu' }).click()
  // The rolled puzzle is kept: the menu offers to continue it.
  await expect(page.getByRole('button', { name: /^Continue, 0 of 8 placed/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New puzzle' })).toBeVisible()
})

test('unlocks and persists a theme; skins apply per slot and update the preview', async ({ page }) => {
  await page.goto('./')
  await page.evaluate(() => localStorage.setItem('qybeq.progress.v1', JSON.stringify({ availableStars: 12, solvedPuzzleCount: 4, unlockedThemeIds: ['classic'], dailyBestStars: {} })))
  await page.reload()
  await declineAnalytics(page)
  await page.getByRole('button', { name: 'Customize' }).click()
  await expect(page.getByText('12 available')).toBeVisible()
  await expect(page.getByRole('img', { name: /Preview: Classic pieces, Ivory dice, Graphite board/ })).toBeVisible()
  await page.getByRole('button', { name: 'Neon theme' }).click()
  await page.getByRole('dialog', { name: /unlock neon/i }).getByRole('button', { name: 'Unlock' }).click()
  await expect(page.getByRole('button', { name: 'Neon theme, selected' })).toBeVisible()
  await expect(page.getByText('0 available')).toBeVisible()
  await expect(page.getByRole('img', { name: /Preview: Neon pieces, Midnight dice, Void board/ })).toBeVisible()
  await page.getByRole('tab', { name: 'Dice' }).click()
  await page.getByRole('button', { name: /^Ivory dice style/ }).click()
  await expect(page.getByRole('button', { name: /Ivory dice style, selected/ })).toBeVisible()
  await expect(page.getByRole('img', { name: /Preview: Neon pieces, Ivory dice, Void board/ })).toBeVisible()
  await page.reload()
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('qybeq.appearance.v1') ?? '{}'))
  expect(stored).toEqual({ pieces: 'neon', dice: 'ivory', board: 'void' })
})

test('keeps unaffordable themes locked', async ({ page }) => {
  await page.goto('./')
  await declineAnalytics(page)
  await page.getByRole('button', { name: 'Customize' }).click()
  await page.getByRole('button', { name: 'Neon theme' }).click()
  await expect(page.getByRole('status')).toHaveText(/not enough stars/i)
  await expect(page.getByRole('button', { name: 'Qybeq Classic theme, selected' })).toBeVisible()
  await page.getByRole('tab', { name: 'Board' }).click()
  await expect(page.getByRole('button', { name: /Void board style, locked/ })).toBeDisabled()
})

test('persists audio controls and the interface language', async ({ page }) => {
  await page.goto('./')
  await declineAnalytics(page)
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.locator('label').filter({ hasText: 'Background playlist' }).locator('input').uncheck()
  await page.locator('label').filter({ hasText: 'Pieces, dice and completion' }).locator('input').uncheck()
  await page.getByRole('button', { name: 'Русский' }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Настройки' }).click()
  await expect(page.locator('label').filter({ hasText: 'Фоновый плейлист' }).locator('input')).not.toBeChecked()
  await expect(page.locator('label').filter({ hasText: 'Фигуры, кубики и завершение' }).locator('input')).not.toBeChecked()
  await expect(page.getByRole('button', { name: 'Русский' })).toHaveAttribute('aria-pressed', 'true')
})

test('walks through the six How to Play lessons in the app', async ({ page }) => {
  await page.goto('./')
  await declineAnalytics(page)
  await page.getByRole('button', { name: 'How to Play' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'How to Play' })).toBeVisible()
  await expect(page.getByLabel('Step 1 of 6')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'The board' })).toBeVisible()
  await expect(page.locator('.howto-controls').getByRole('button', { name: 'Back' })).toBeDisabled()
  for (const title of ['Your pieces', 'Rotate', 'Flip', 'Place', 'Fill the board']) {
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
  }
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('heading', { name: 'Place' })).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('teaches rotate, flip and drag on the standalone lessons page', async ({ page }) => {
  await page.goto('./how-to-play.html?lang=en')
  await expect(page.getByRole('heading', { name: 'The board' })).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  const rotateDemo = page.getByRole('button', { name: /Tap to rotate/ })
  await expect(rotateDemo).toHaveAttribute('data-orientation', '0')
  await rotateDemo.click()
  await expect(rotateDemo).toHaveAttribute('data-orientation', '1')

  await page.getByRole('button', { name: 'Next' }).click()
  const flipDemo = page.getByRole('button', { name: /Tap to rotate/ })
  await expect(flipDemo).toHaveAttribute('data-mirrored', 'false')
  await page.getByRole('button', { name: 'Flip' }).click()
  await expect(flipDemo).toHaveAttribute('data-mirrored', 'true')

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('heading', { name: 'Place' })).toBeVisible()
  await page.waitForTimeout(400)
  const piece = page.getByRole('button', { name: 'Drag the piece onto the outline' })
  const from = await piece.boundingBox()
  const grid = await page.locator('.place-demo .mini-board > div').boundingBox()
  if (!from || !grid) throw new Error('Lesson geometry is unavailable')
  const cell = grid.width / 6
  // The L's outline starts at B1: grab its top-left cell and drop it there.
  await page.mouse.move(from.x + cell / 2, from.y + cell / 2)
  await page.mouse.down()
  await page.mouse.move(grid.x + cell / 2, grid.y + cell * 1.5, { steps: 10 })
  await page.mouse.up()
  await expect(page.getByRole('status').filter({ hasText: 'Placed!' })).toBeVisible()
})

test('opens the standalone lessons page in Russian', async ({ page }) => {
  await page.goto('./how-to-play.html?lang=ru')
  await expect(page.getByRole('heading', { level: 1, name: 'Как играть' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Игровое поле' })).toBeVisible()
  await page.getByRole('button', { name: 'Назад' }).first().click()
  await expect(page).toHaveURL(/\/$/)
})

test('plays with the keyboard: pick up, place and send back', async ({ page }) => {
  await startPuzzle(page)
  await page.locator('[data-piece="square"]').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText(/Arrows move/)).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.locator('.placed-piece')).toHaveCount(1)
  // Placing hands focus to the next piece in the tray.
  await expect(page.locator('[data-piece="line4"]')).toBeFocused()
  await page.locator('[data-board-piece="square"]').focus()
  await page.keyboard.press('Delete')
  await expect(page.locator('.placed-piece')).toHaveCount(0)

  await page.locator('[data-piece="line4"]').focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Escape')
  await expect(page.locator('.placed-piece')).toHaveCount(0)
  await expect(page.getByText(/Enter pick up/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible()
})

test('continues an unfinished puzzle from the main menu', async ({ page }) => {
  const blocked = await startPuzzle(page)
  await page.locator('[data-piece="square"]').focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await expect(page.locator('.placed-piece')).toHaveCount(1)
  await page.getByRole('button', { name: 'Game menu' }).click()
  await page.getByRole('button', { name: 'Main Menu' }).click()

  await page.reload()
  const resume = page.getByRole('button', { name: /^Continue, 1 of 8 placed/ })
  await expect(resume).toBeVisible()
  await resume.click()
  await expect(page.locator('.dice-roll-layer')).toHaveCount(0)
  await expect(page.locator('.placed-piece')).toHaveCount(1)
  const restored = await page.locator('.board-grid .tile-art').evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute('aria-label') ?? ''))
  expect(restored.sort()).toEqual([...blocked].sort())

  await page.getByRole('button', { name: 'Game menu' }).click()
  await page.getByRole('button', { name: 'Main Menu' }).click()
  await page.getByRole('button', { name: 'New puzzle' }).click()
  await page.getByRole('dialog', { name: 'New puzzle?' }).getByRole('button', { name: 'New puzzle' }).click()
  await expect(page.getByText('Roll to set the puzzle')).toBeVisible()
  await page.getByRole('button', { name: 'Game menu' }).click()
  await page.getByRole('button', { name: 'Main Menu' }).click()
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
})

test('opens the privacy policy from the consent banner', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('dialog', { name: /help improve qybeq/i }).getByRole('link', { name: /privacy policy/i }).click()
  await expect(page).toHaveURL(/privacy\.html$/)
  await expect(page.getByRole('heading', { name: /privacy policy/i })).toBeVisible()
})

test('loads Yandex Metrika only after consent and keeps the setting', async ({ page }) => {
  await page.route('https://mc.yandex.ru/**', (route) => route.abort())
  await page.goto('./')
  await expect(page.getByRole('dialog', { name: /help improve qybeq/i })).toBeVisible()
  await expect(page.locator('#qybeq-yandex-metrika')).toHaveCount(0)
  await page.getByRole('button', { name: /^allow$/i }).click()
  await expect(page.locator('#qybeq-yandex-metrika')).toHaveAttribute('src', /113110265/)
  expect(await page.evaluate(() => localStorage.getItem('qybeq.analytics.v1'))).toBe('enabled')
  await page.getByRole('button', { name: 'Settings' }).click()
  const analytics = page.locator('label').filter({ hasText: 'Anonymous analytics' }).locator('input')
  await expect(analytics).toBeChecked()
  await analytics.uncheck()
  expect(await page.evaluate(() => localStorage.getItem('qybeq.analytics.v1'))).toBe('disabled')
})

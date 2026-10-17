import { expect, test, type Page } from '@playwright/test'

async function declineAnalytics(page: Page) {
  const dialog = page.getByRole('dialog', { name: /help improve qybeq/i })
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: /not now/i }).click()
}

/** Main menu → Play → Classic → Roll Dice → skip the throw. */
async function startCube(page: Page) {
  await page.goto('./')
  await declineAnalytics(page)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.getByRole('button', { name: /^Classic/ }).click()
  await page.getByRole('button', { name: 'Roll Dice' }).click()
  // A tap on the cube skips the throw.
  const stage = await page.locator('.cube-stage').boundingBox()
  if (!stage) throw new Error('No stage')
  await page.mouse.click(stage.x + stage.width / 2, stage.y + stage.height * 0.3)
  // The tray and the piece tools come up; a first game shows a tip.
  await expect(page.locator('canvas.cube-tray')).toBeVisible()
  await expect(page.locator('.cube-caption')).toHaveText(/tap a piece|free cells/i)
}

test('opens the main menu without horizontal overflow', async ({ page }) => {
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

test('throws the dice and opens the tray and the tools', async ({ page }) => {
  await startCube(page)
  await expect(page.locator('canvas.cube-tray')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
  await expect(page.getByTestId('cube-hint')).toBeEnabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('carries a piece from the tray onto the cube', async ({ page }) => {
  await startCube(page)
  const tray = await page.locator('canvas.cube-tray').boundingBox()
  const stage = await page.locator('.cube-stage').boundingBox()
  if (!tray || !stage) throw new Error('No layout')
  await page.mouse.move(tray.x + 30, tray.y + 30)
  await page.mouse.down()
  const to = { x: stage.x + stage.width * 0.45, y: stage.y + stage.height * 0.3 }
  await page.mouse.move(to.x, to.y, { steps: 12 })
  await expect(page.locator('.cube-caption')).toHaveText(/let go|taken|over the cube/i)
  await page.mouse.up()
  await expect(page.locator('.cube-caption')).not.toHaveText(/let go|over the cube/i)
})

test('a hint picks its piece and outlines its place', async ({ page }) => {
  await startCube(page)
  await page.getByTestId('cube-hint').click()
  await expect(page.locator('.cube-caption')).toHaveText(/outline|move|take/i)
  await expect(page.getByRole('button', { name: 'Done' })).toBeEnabled()
})

test('a finished cube shows the results', async ({ page }) => {
  await startCube(page)
  await page.getByTestId('cube-menu').click()
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible()
  // Development builds have Auto-solve, like the mobile Developer section.
  await page.getByRole('button', { name: 'Auto-solve' }).click()
  await expect(page.getByRole('heading', { name: 'Cube Complete' })).toBeVisible({ timeout: 4000 })
  await page.getByRole('button', { name: 'New Puzzle' }).click()
  await expect(page.getByRole('button', { name: 'Roll Dice' })).toBeVisible()
})

test('the lessons page through all six steps', async ({ page }) => {
  await page.goto('./')
  await declineAnalytics(page)
  await page.getByRole('button', { name: 'How to Play' }).click()
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
})

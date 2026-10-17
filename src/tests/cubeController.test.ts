import { describe, expect, it } from 'vitest'
import { CubeFormats } from '../cube/generator'
import { rectContains, rectHeight, rectWidth } from '../cube/geometry'
import { CubeSession } from '../cube/session'
import { StableRandom } from '../cube/stableRandom'
import type { CompletionAward } from '../progress/playerProgress'
import { CubeController, layoutFor, type CubeServices } from '../screens/game/cubeController'

/** A controller on a fixed cube with services that only record. */
function setUp() {
  let clock = 0
  const session = new CubeSession({ random: new StableRandom(7), now: () => clock })
  const log = { effects: [] as string[], haptics: [] as string[], saves: 0, solved: 0 }
  const learned = new Set<string>()
  const award: CompletionAward = { key: 'k', attemptStars: 3, previousBest: 0, earnedDelta: 3, availableStars: 3, isFirstCompletion: true }
  const services: CubeServices = {
    play: (effect) => log.effects.push(effect),
    feel: (haptic) => log.haptics.push(haptic),
    cubeView: () => true,
    hasLearned: (tip) => learned.has(tip),
    markLearned: (tip) => learned.add(tip),
    reduceMotion: () => false,
    save: () => log.saves++,
    onSolved: () => {
      log.solved++
      return award
    },
  }
  const controller = new CubeController(session, services, { format: CubeFormats.three })
  controller.setLayout(layoutFor(390, 844))
  const detach = controller.attach()
  let frame = 1000
  /** Plays [ms] of frames (and of the session's clock). */
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += 16) {
      frame += 16
      clock += 16
      controller.tick(frame)
    }
  }
  /** Lets promise callbacks (an animation's end) run. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
  return { session, controller, log, run, settle, detach, learned }
}

async function playing() {
  const s = setUp()
  s.controller.rollDice()
  expect(s.controller.phase).toBe('rolling')
  s.run(4000)
  await s.settle()
  expect(s.controller.phase).toBe('playing')
  return s
}

describe('layoutFor', () => {
  it('lays a phone out as the mobile screen does', () => {
    const l = layoutFor(390, 844)
    expect(l.landscape).toBe(false)
    expect(l.viewport.top).toBe(56)
    const trayHeight = Math.min(156, 844 * 0.21)
    expect(rectHeight(l.tray)).toBeCloseTo(trayHeight)
    expect(l.tray.bottom).toBeCloseTo(844 - 8)
    expect(l.toolbar.top).toBeCloseTo(l.viewport.bottom)
    expect(l.caption.top).toBeCloseTo(l.toolbar.bottom)
  })

  it('puts the tools and the tray beside the cube on wide screens', () => {
    const l = layoutFor(1280, 720)
    expect(l.landscape).toBe(true)
    expect(l.tray.left).toBeGreaterThan(l.viewport.right)
    expect(rectWidth(l.viewport)).toBeGreaterThan(rectWidth(l.tray))
    expect(rectContains(l.prompt, { x: l.tray.left + 10, y: l.tray.top + 10 })).toBe(true)
  })
})

describe('CubeController', () => {
  it('throws the dice, then shows the tray and starts the clock', async () => {
    const { controller, session, log, detach } = await playing()
    expect(log.effects[0]).toBe('dice')
    expect(log.haptics).toContain('dieHome')
    expect(session.clockStarted).toBe(true)
    expect(session.clockRunning).toBe(true)
    expect(controller.trayOpacity).toBe(0)
    expect(controller.trayArea).not.toBeNull()
    detach()
    expect(session.clockRunning).toBe(false)
  })

  it('skips the throw on a tap', async () => {
    const { controller, settle } = setUp()
    controller.rollDice()
    controller.pointerDown(1, { x: 195, y: 300 })
    await settle()
    expect(controller.phase).toBe('playing')
  })

  it('picks a tray piece on the first tap and turns it on the next', async () => {
    const { controller, session, run, learned } = await playing()
    run(400)
    const area = controller.trayArea!
    const p = { x: area.left + 30, y: area.top + 30 }
    controller.pointerDown(1, p)
    controller.pointerUp(1, p, 100)
    const id = controller.selected!
    expect(id).not.toBeNull()
    expect(learned.has('rotate')).toBe(true)
    const before = JSON.stringify(session.game.trayShape(id))
    controller.pointerDown(1, p)
    controller.pointerUp(1, p, 200)
    expect(JSON.stringify(session.game.trayShape(id))).not.toBe(before)
  })

  it('flies an undone piece back to the tray', async () => {
    const { controller, session, run, settle, log } = await playing()
    const game = session.game
    const move = game.level.solution[0]
    game.place(move.pieceId, move.shape, move.origin)
    expect(game.isPlaced(move.pieceId)).toBe(true)
    controller.undo()
    // It stays drawn in flight while the game already has it in the tray.
    expect(game.isPlaced(move.pieceId)).toBe(false)
    run(700)
    await settle()
    expect(log.haptics).toContain('land')
  })

  it('sends a placed piece back to the tray, taking it out on landing', async () => {
    const { controller, session, run, settle } = await playing()
    const game = session.game
    const move = game.level.solution[0]
    game.place(move.pieceId, move.shape, move.origin)
    controller.selected = move.pieceId
    controller.toTray()
    expect(game.isPlaced(move.pieceId)).toBe(true)
    run(700)
    await settle()
    expect(game.isPlaced(move.pieceId)).toBe(false)
  })

  it('shows a hint for a piece and picks it', async () => {
    const { controller, session } = await playing()
    expect(controller.requestHint()).toBe('shown')
    const hint = session.hints.active!
    expect(controller.selected).toBe(hint.pieceId)
    expect(controller.requestHint()).toBe('alreadyShown')
    expect(session.assistanceUsed).toBe(true)
  })

  it('celebrates a finished cube and then brings up the results', async () => {
    const { controller, session, run, log } = await playing()
    session.game.applySolution(session.game.level.solution)
    expect(controller.solved).toBe(true)
    expect(log.solved).toBe(1)
    expect(controller.award?.attemptStars).toBe(3)
    expect(session.clockRunning).toBe(false)
    expect(controller.resultReady).toBe(false)
    run(900)
    expect(controller.resultReady).toBe(true)
    expect(log.haptics).toContain('layer')
  })

  it('stops the clock while a sheet is open', async () => {
    const { controller, session } = await playing()
    controller.openSheet()
    expect(session.clockRunning).toBe(false)
    controller.closeSheet()
    expect(session.clockRunning).toBe(true)
  })

  it('goes back to the empty cube for a new puzzle', async () => {
    const { controller, session } = await playing()
    controller.newPuzzle()
    expect(controller.phase).toBe('readyToRoll')
    expect(session.game.hasPuzzle).toBe(false)
    expect(controller.trayArea).toBeNull()
  })
})

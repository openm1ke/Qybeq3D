import { platform } from '../../platform'
import type { CubeSession } from '../../cube/session'

/** How asking for help with a video ended (mobile `RewardOutcome`). */
export type RewardOutcome = 'granted' | 'dismissed' | 'unavailable' | 'failed' | 'expired'

/**
 * Connects rewarded videos to the cube (mobile `CubeHelp`): the only object
 * that knows both the platform's videos and the [CubeSession] that gets
 * the reward. One video at a time; a reward belongs to the cube it was
 * asked for.
 */
export class CubeHelp {
  private readonly session: CubeSession
  private readonly save: () => void
  private inFlight: Promise<RewardOutcome> | null = null
  private inFlightType: 'hint' | 'solution' | null = null
  lastHintWasFallback = false

  constructor(session: CubeSession, save: () => void) {
    this.session = session
    this.save = save
  }

  get busy(): boolean {
    return this.inFlight !== null
  }

  /** One video, turned into exactly one hint if the platform confirms it.
   * A missing or failed video never blocks play: the hint is given anyway. */
  watchForHint(): Promise<RewardOutcome> {
    this.lastHintWasFallback = false
    return this.watch('hint', () => this.session.hints.grantRewardedHint(), true)
  }

  /** One video that unlocks the solution of the cube in play. */
  watchForSolution(): Promise<RewardOutcome> {
    if (this.session.solutionUnlocked) return Promise.resolve('granted')
    return this.watch('solution', () => {
      this.session.unlockSolution()
      return true
    })
  }

  private watch(type: 'hint' | 'solution', apply: () => boolean, grantWhenUnavailable = false): Promise<RewardOutcome> {
    if (this.inFlight) return type === this.inFlightType ? this.inFlight : Promise.resolve('unavailable')
    const run = this.run(apply, grantWhenUnavailable).finally(() => {
      this.inFlight = null
      this.inFlightType = null
    })
    this.inFlight = run
    this.inFlightType = type
    return run
  }

  private async run(apply: () => boolean, grantWhenUnavailable: boolean): Promise<RewardOutcome> {
    const game = this.session.game
    if (!game.hasPuzzle || game.isSolved) return 'expired'
    const puzzle = game.level
    const stillInPlay = () => game.hasPuzzle && game.level === puzzle && !game.isSolved
    let confirmed = false
    let applied = false
    const result = await platform.showRewardedVideo(() => {
      // A second confirmation never pays twice.
      if (confirmed) return
      confirmed = true
      if (!stillInPlay()) return
      applied = apply()
      if (applied) this.save()
    })
    const outcome: RewardOutcome = result === 'rewarded' ? (applied ? 'granted' : 'expired') : result
    if (!grantWhenUnavailable || (outcome !== 'unavailable' && outcome !== 'failed')) return outcome
    if (!stillInPlay()) return 'expired'
    if (!apply()) return 'expired'
    this.lastHintWasFallback = true
    this.save()
    return 'granted'
  }
}

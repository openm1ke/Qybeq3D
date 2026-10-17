/**
 * Flutter's `AnimationController`, as far as the cube screen uses it: a
 * value from 0 to 1 over [duration] milliseconds, run forward or back,
 * repeated back and forth, stopped or jumped. Ticked by the screen's frame
 * loop with the frame's time.
 */
export class Anim {
  value = 0
  duration: number
  private direction: 0 | 1 | -1 = 0
  private repeating = false
  private startedAt: number | null = null
  private startValue = 0
  private onDone: (() => void) | null = null

  constructor(duration: number) {
    this.duration = duration
  }

  get isAnimating(): boolean {
    return this.direction !== 0
  }

  /** Moving towards 1 (or already there after a forward run). */
  get isForward(): boolean {
    return this.direction === 1
  }

  /** Runs to 1 (from [from] if given); resolves when it gets there. */
  forward(from?: number): Promise<void> {
    if (from !== undefined) this.value = from
    // As in Flutter, a plain run ends any back-and-forth.
    this.repeating = false
    return this.run(1)
  }

  reverse(): Promise<void> {
    this.repeating = false
    return this.run(-1)
  }

  /** Back and forth forever (the hint's breathing). */
  repeat(): void {
    this.repeating = true
    void this.run(this.value >= 1 ? -1 : 1)
  }

  /** Stops where it is. As in Flutter, the run's promise then never
   * resolves: whoever stopped it finishes the job. */
  stop(): void {
    this.direction = 0
    this.repeating = false
    this.startedAt = null
    this.onDone = null
  }

  reset(): void {
    this.stop()
    this.value = 0
  }

  /** Jumps to [value] at once (skipping the rest of a run). */
  set(value: number): void {
    const wasRunning = this.isAnimating
    this.value = value
    if (wasRunning && ((this.direction === 1 && value >= 1) || (this.direction === -1 && value <= 0))) this.finish()
  }

  private run(direction: 1 | -1): Promise<void> {
    // A new run replaces the last; the last one's promise never resolves.
    this.direction = direction
    this.startedAt = null
    this.startValue = this.value
    return new Promise((resolve) => {
      this.onDone = resolve
    })
  }

  private finish(): void {
    if (this.repeating) {
      void this.run(this.direction === 1 ? -1 : 1)
      return
    }
    this.direction = 0
    this.startedAt = null
    const done = this.onDone
    this.onDone = null
    done?.()
  }

  /** Advances to frame time [now] (ms); returns whether it moved. */
  tick(now: number): boolean {
    if (this.direction === 0) return false
    if (this.startedAt === null) this.startedAt = now
    const target = this.direction === 1 ? 1 : 0
    const span = Math.abs(target - this.startValue)
    const total = this.duration * span
    const t = total <= 0 ? 1 : Math.min(1, (now - this.startedAt) / total)
    this.value = this.startValue + (target - this.startValue) * t
    if (t >= 1) {
      this.value = target
      this.finish()
    }
    return true
  }
}

/**
 * The mobile app's `StableRandom`, bit for bit: a 32-bit xorshift whose
 * sequence is owned by the game, so a seed names the same cube on the web
 * and on the phone (saves, the daily cube, the player's records).
 */
export class StableRandom {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
    if (this.state === 0) this.state = 0x6d2b79f5
  }

  private next32(): number {
    let x = this.state
    x = (x ^ (x << 13)) >>> 0
    x = (x ^ (x >>> 17)) >>> 0
    x = (x ^ (x << 5)) >>> 0
    this.state = x
    return x
  }

  nextBool(): boolean {
    return (this.next32() & 1) === 1
  }

  nextDouble(): number {
    return this.next32() / 0x100000000
  }

  nextInt(max: number): number {
    if (max <= 0) throw new RangeError(`max must be positive: ${max}`)
    return this.next32() % max
  }
}

/** The random source the game draws from (a seeded one in tests). */
export interface RandomSource {
  nextInt(max: number): number
  nextDouble(): number
  nextBool(): boolean
}

export const mathRandom: RandomSource = {
  nextInt: (max) => Math.floor(Math.random() * max),
  nextDouble: () => Math.random(),
  nextBool: () => Math.random() < 0.5,
}

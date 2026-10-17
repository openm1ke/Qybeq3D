/**
 * The Dart VM's `dart:math` `Random(seed)`, bit for bit: a multiply-with-carry
 * generator seeded through Thomas Wang's 64-bit mix and cranked four times.
 *
 * The mobile app derives fixed artwork (the sandstone grain on dice) from
 * `Random(7319)`; reproducing the sequence keeps that artwork identical.
 */
const mask32 = 0xffffffffn
const mask64 = (1n << 64n) - 1n
const multiplier = 0xffffda61n
const pow2of32 = 0x100000000

function mix64(value: bigint): bigint {
  let n = value
  n = (~n + (n << 21n)) & mask64
  n ^= n >> 24n
  n = (n + (n << 3n) + (n << 8n)) & mask64
  n ^= n >> 14n
  n = (n + (n << 2n) + (n << 4n)) & mask64
  n ^= n >> 28n
  n = (n + (n << 31n)) & mask64
  return n
}

export class DartRandom {
  private low: bigint
  private high: bigint

  constructor(seed: number) {
    let state = mix64(BigInt.asUintN(64, BigInt(seed)))
    if (state === 0n) state = 0x5a17n
    this.low = state & mask32
    this.high = state >> 32n
    for (let i = 0; i < 4; i += 1) this.nextState()
  }

  private nextState(): void {
    const state = multiplier * this.low + this.high
    this.low = state & mask32
    this.high = (state >> 32n) & mask32
  }

  nextInt(max: number): number {
    if (max <= 0 || max > pow2of32) throw new RangeError(`max out of range: ${max}`)
    if ((max & -max) === max) {
      this.nextState()
      return Number(this.low & BigInt(max - 1))
    }
    let random32: number
    let result: number
    do {
      this.nextState()
      random32 = Number(this.low)
      result = random32 % max
    } while (random32 - result + max > pow2of32)
    return result
  }

  nextDouble(): number {
    return (this.nextInt(1 << 26) * 2 ** 27 + this.nextInt(1 << 27)) / 2 ** 53
  }

  nextBool(): boolean {
    return this.nextInt(2) === 0
  }
}

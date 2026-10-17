import fixture from '../fixtures/cube-parity.v1.json'
import { CubeAim } from '../cube/aim'
import { DailyCube } from '../cube/daily'
import { CubeGame } from '../cube/game'
import { CubePuzzles, formatOf } from '../cube/generator'
import { CubeHintEngine } from '../cube/hints'
import { CubePieces, type Shape } from '../cube/model'
import { StableRandom } from '../cube/stableRandom'

// The fixture is written by the mobile app's own code
// (QybeqMobile/tool/web_parity/dump_cube_parity_test.dart): the same seed
// must make the same cube on the web as on the phone.
const cells = (shape: Shape) => shape.map((c) => [c.x, c.y, c.z])

describe('parity with the mobile app', () => {
  it('draws the same random numbers', () => {
    for (const [seed, expected] of Object.entries(fixture.randoms)) {
      const r = new StableRandom(Number(seed))
      const got = [
        ...Array.from({ length: 8 }, () => r.nextInt(1000)),
        ...Array.from({ length: 4 }, () => r.nextDouble()),
        ...Array.from({ length: 4 }, () => (r.nextBool() ? 1 : 0)),
      ]
      expect(got).toEqual(expected)
    }
  })

  it('turns the pieces into the same orientations, in the same order', () => {
    for (const piece of CubePieces.standard) {
      expect(piece.orientations.map(cells)).toEqual(fixture.orientations[piece.id as keyof typeof fixture.orientations])
    }
  })

  it('makes the same cubes from the same seeds', () => {
    for (const expected of fixture.puzzles) {
      const level = CubePuzzles.generate(formatOf(expected.size), expected.seed)
      expect(level.key).toBe(expected.key)
      expect(cells(level.blocked)).toEqual(expected.blocked)
      expect(level.pieces.map((p) => ({
        id: p.id,
        color: p.colorKey,
        cells: cells(p.cells),
        start: cells(level.startShapes.get(p.id)!),
        orientations: p.orientations.length,
        shapeKey: p.shapeKey,
      }))).toEqual(expected.pieces)
      expect(level.solution.map((p) => ({ piece: p.pieceId, shape: cells(p.shape), at: [p.origin.x, p.origin.y, p.origin.z] }))).toEqual(expected.solution)
      const hint = CubeHintEngine.next(new CubeGame(level))
      expect(hint && { kind: hint.kind, piece: hint.pieceId, shape: cells(hint.shape), at: [hint.origin.x, hint.origin.y, hint.origin.z] }).toEqual(expected.hint)
    }
  })

  it('seeds the same daily cube', () => {
    for (const [day, seed] of Object.entries(fixture.daily)) {
      const [y, m, d] = day.split('-').map(Number)
      expect(DailyCube.seedFor(new Date(y, m - 1, d))).toBe(seed)
    }
  })

  it('orders the turns of a piece the same way', () => {
    for (const piece of [CubePieces.ell, CubePieces.tripod, CubePieces.tee]) {
      expect(CubeAim.byTurns(piece, piece.cells).map(([shape, turns]) => ({ shape: cells(shape), turns }))).toEqual(
        fixture.byTurns[piece.id as keyof typeof fixture.byTurns],
      )
    }
  })
})

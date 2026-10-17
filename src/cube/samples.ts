import { CubePieces, CubePlacement, Voxel } from './model'
import { CubeSolver } from './solver'

/** Cells of one piece and the skin colour it wears. */
export interface CubePart {
  readonly cells: readonly Voxel[]
  readonly colorKey: string
}

/** The 3×3×3 example the app shows: its dice and its pieces, lowest first. */
export const sampleDice = [new Voxel(2, 0, 2), new Voxel(0, 1, 2), new Voxel(1, 2, 1)]

export const sampleParts: readonly CubePart[] = (() => {
  const solution = new CubeSolver({ size: 3, blocked: sampleDice, pieces: CubePieces.standard }).solve()!
  const low = (p: CubePlacement) => Math.min(...p.cells.map((c) => c.index(3)))
  return [...solution]
    .sort((a, b) => low(a) - low(b))
    .map((p) => ({ cells: p.cells, colorKey: CubePieces.standard.find((q) => q.id === p.pieceId)!.colorKey }))
})()

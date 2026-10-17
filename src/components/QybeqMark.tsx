import { useLayoutEffect, useRef } from 'react'
import { classicAppearance } from '../cosmetics/appearance'
import { CubeCamera, V3 } from '../cube/camera'
import { Curves } from '../cube/math'
import { paintCube } from '../cube/painter'
import { CubeScene, Solid } from '../cube/scene'
import { prepareCanvas } from '../rendering/canvas'
import { sampleDice, sampleParts } from '../cube/samples'

const camera = new CubeCamera()

/**
 * The Qybeq mark (mobile `QybeqMark`): a 3×3×3 cube assembled from the
 * game's seven pieces around three dice, drawn by the game's own renderer.
 * The same sign as the app icon; on the menu it is assembled piece by piece
 * via [progress]. It always wears the Classic look.
 */
export function QybeqMark({ cellSize, progress = 1, reduceMotion = false }: { cellSize: number; progress?: number; reduceMotion?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const extent = 5 * cellSize
  useLayoutEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = prepareCanvas(canvas, extent, extent, 0)
    if (!ctx) return
    const solids: Solid[] = []
    // Each part falls from above and fades in; dice first, then pieces from
    // the bottom layer up.
    const add = (make: (offset: V3) => Solid, delay: number) => {
      const t = reduceMotion ? progress : Math.min(1, Math.max(0, (progress - delay) / 0.45))
      if (t <= 0) return
      const fall = reduceMotion ? 0 : 2.4 * (1 - Curves.easeOutCubic(t))
      const solid = make(new V3(0, fall, 0))
      solid.alpha = t < 1 ? t : 1
      solids.push(solid)
    }
    sampleDice.forEach((d, i) => add((offset) => new Solid({ kind: 'die', id: `die${i}`, cells: [d], colorKey: '', offset }), i * 0.06))
    sampleParts.forEach((p, i) => add((offset) => new Solid({ kind: 'piece', id: `part${i}`, cells: p.cells, colorKey: p.colorKey, offset }), 0.2 + i * 0.05))
    const scene = CubeScene.build({ size: 3, solids, camera, centre: { x: extent / 2, y: extent / 2 }, scale: extent / 5.6 })
    paintCube(ctx, scene, classicAppearance, { showPlate: false, showBounds: false })
  }, [extent, progress, reduceMotion])
  return <canvas ref={ref} aria-hidden="true" style={{ width: extent, height: extent, display: 'block' }} />
}

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useAppearance } from '../cosmetics/appearance'
import { CubeCamera } from '../cube/camera'
import { CubePieces, CubePlacement, Voxel } from '../cube/model'
import { paintCube } from '../cube/painter'
import { CubeScene, Solid } from '../cube/scene'
import { CubeSolver } from '../cube/solver'

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

/**
 * A cube drawn by the game's renderer in the current appearance
 * (`CubePicture`): lessons, skin previews, the menu. Optionally turned by
 * hand.
 */
export function CubePicture({
  extent,
  size = 3,
  dice = [],
  parts = [],
  ghost,
  plate = true,
  bounds = true,
  turnable = false,
  yaw = CubeCamera.restYaw,
  pitch = CubeCamera.restPitch,
  className,
  style,
}: {
  extent: number
  size?: number
  dice?: readonly Voxel[]
  parts?: readonly CubePart[]
  ghost?: CubePart
  plate?: boolean
  bounds?: boolean
  turnable?: boolean
  yaw?: number
  pitch?: number
  className?: string
  style?: CSSProperties
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const skins = useAppearance()
  const [view, setView] = useState({ yaw, pitch })
  const drag = useRef<{ x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.round(extent * ratio)
    canvas.height = Math.round(extent * ratio)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, extent, extent)
    const scene = CubeScene.build({
      size,
      camera: new CubeCamera(view.yaw, view.pitch),
      centre: { x: extent / 2, y: extent / 2 - extent * 0.03 },
      scale: extent / (size * 1.95),
      solids: [
        ...dice.map((d, i) => new Solid({ kind: 'die', id: `die${i}`, cells: [d], colorKey: '' })),
        ...parts.map((p, i) => new Solid({ kind: 'piece', id: `part${i}`, cells: p.cells, colorKey: p.colorKey })),
        ...(ghost ? [new Solid({ kind: 'ghost', id: 'ghost', cells: ghost.cells, colorKey: ghost.colorKey })] : []),
      ],
    })
    paintCube(ctx, scene, skins, { showPlate: plate, showBounds: bounds })
  }, [extent, size, dice, parts, ghost, plate, bounds, view, skins])

  return (
    <canvas
      ref={ref}
      className={className}
      aria-hidden="true"
      style={{ width: extent, height: extent, display: 'block', touchAction: turnable ? 'none' : undefined, cursor: turnable ? 'grab' : undefined, ...style }}
      onPointerDown={turnable ? (e) => {
        drag.current = { x: e.clientX, y: e.clientY }
        e.currentTarget.setPointerCapture(e.pointerId)
      } : undefined}
      onPointerMove={turnable ? (e) => {
        const from = drag.current
        if (!from) return
        const camera = new CubeCamera(view.yaw, view.pitch)
        camera.orbit((e.clientX - from.x) * 0.011, (e.clientY - from.y) * 0.011)
        drag.current = { x: e.clientX, y: e.clientY }
        setView({ yaw: camera.yaw, pitch: camera.pitch })
      } : undefined}
      onPointerUp={turnable ? () => { drag.current = null } : undefined}
      onPointerCancel={turnable ? () => { drag.current = null } : undefined}
    />
  )
}

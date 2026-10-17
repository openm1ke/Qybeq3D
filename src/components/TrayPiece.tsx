import { useLayoutEffect, useRef } from 'react'
import { useAppearance } from '../cosmetics/appearance'
import type { Shape } from '../cube/model'
import type { SolidMotion } from '../cube/scene'
import { paintTrayPiece } from '../cube/tray'
import { prepareCanvas } from '../rendering/canvas'

/** One piece as the tray shows it (mobile `CubeTrayPiecePainter`), in the
 * current appearance. */
export function TrayPiece({ shape, colorKey, size, motion = null }: { shape: Shape; colorKey: string; size: number; motion?: SolidMotion | null }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const skins = useAppearance()
  useLayoutEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = prepareCanvas(canvas, size, size, 0)
    if (ctx) paintTrayPiece(ctx, size, size, { shape, colorKey, motion }, skins)
  }, [shape, colorKey, size, motion, skins])
  return <canvas ref={ref} aria-hidden="true" style={{ width: size, height: size, display: 'block' }} />
}

import { memo, useLayoutEffect, useRef } from 'react'
import type { DiceSkin } from '../cosmetics/skins'
import { css } from '../rendering/color'
import { roundedRect } from '../rendering/canvas'
import { paintDiceSurface } from '../rendering/surfaceDetails'

/** A small die showing five pips, slightly tilted, in the dice skin
 * (`DieIconPainter` of the Roll Dice button). */
export const DieIcon = memo(function DieIcon({ size, skin }: { size: number; skin: DiceSkin }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useLayoutEffect(() => {
    const canvas = ref.current
    const ratio = window.devicePixelRatio || 1
    if (!canvas) return
    canvas.width = Math.round(size * ratio)
    canvas.height = Math.round(size * ratio)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, size, size)
    const s = size
    ctx.translate(size / 2, size / 2)
    ctx.rotate(-0.18)
    const half = (s * 0.86) / 2
    const body = { left: -half, top: -half, right: half, bottom: half }
    const radius = s * 0.2
    ctx.fillStyle = css(skin.iconSide)
    ctx.fill(roundedRect({ left: body.left, top: body.top + s * 0.06, right: body.right, bottom: body.bottom + s * 0.06 }, radius))
    ctx.fillStyle = css(skin.faceTop)
    ctx.fill(roundedRect(body, radius))
    paintDiceSurface(ctx, body, radius, skin)
    ctx.fillStyle = css(skin.pip)
    const d = s * 0.22
    for (const [x, y] of [[0, 0], [-d, -d], [d, -d], [-d, d], [d, d]]) {
      ctx.beginPath()
      ctx.arc(x, y, s * 0.07, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [size, skin])
  return <canvas ref={ref} style={{ width: size, height: size, display: 'block' }} aria-hidden="true" />
})

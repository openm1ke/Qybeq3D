import { useLayoutEffect, useRef } from 'react'
import { AppearanceContext, presetAppearance } from '../cosmetics/appearance'
import { presets } from '../cosmetics/skins'
import { CubePicture, sampleDice, sampleParts } from '../components/CubePicture'
import { CubePuzzles, CubeFormats } from '../cube/generator'
import { paintTrayPiece } from '../cube/tray'

/** Development only (`?lab`): the cube renderer in every theme, and tray
 * pieces of a big cube, to compare with the phone. */
export function RenderLab() {
  return (
    <div style={{ padding: 16, display: 'flex', flexWrap: 'wrap', gap: 16, background: '#0d0e11', minHeight: '100vh' }}>
      {presets.map((preset) => (
        <AppearanceContext.Provider key={preset.id} value={presetAppearance(preset)}>
          <figure style={{ margin: 0, color: '#8d93a0', font: '12px system-ui' }}>
            <CubePicture extent={260} dice={sampleDice} parts={sampleParts.slice(0, 6)} turnable />
            <figcaption>{preset.name}</figcaption>
          </figure>
        </AppearanceContext.Provider>
      ))}
      <TrayStrip />
    </div>
  )
}

function TrayStrip() {
  const ref = useRef<HTMLCanvasElement>(null)
  useLayoutEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const level = CubePuzzles.generate(CubeFormats.five, 42)
    const slot = 90
    const ratio = window.devicePixelRatio || 1
    canvas.width = slot * 8 * ratio
    canvas.height = slot * 3 * ratio
    level.pieces.forEach((p, i) => {
      ctx.setTransform(ratio, 0, 0, ratio, (i % 8) * slot * ratio, Math.floor(i / 8) * slot * ratio)
      paintTrayPiece(ctx, slot, slot, { shape: level.startShapes.get(p.id)!, colorKey: p.colorKey, selected: i === 2 }, presetAppearance(presets[0]))
    })
  }, [])
  return <canvas ref={ref} style={{ width: 720, height: 270 }} />
}

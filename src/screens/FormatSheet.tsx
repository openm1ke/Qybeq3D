import { useLayoutEffect, useRef } from 'react'
import { Icon } from '../components/Icon'
import { Sheet } from '../components/ui'
import { useAppearance } from '../cosmetics/appearance'
import { CubeCamera } from '../cube/camera'
import { allFormats, CubePuzzles, type CubeFormat } from '../cube/generator'
import type { CubeLevel } from '../cube/model'
import { paintCube } from '../cube/painter'
import { CubeScene, Solid } from '../cube/scene'
import { useText } from '../i18n/text'
import { prepareCanvas } from '../rendering/canvas'

/** Asks which cube to play (mobile `showCubeFormatSheet`); [current] is
 * marked as the last one played. */
export function FormatSheet({ current, onChoose, onDismiss }: { current: CubeFormat; onChoose: (format: CubeFormat) => void; onDismiss: () => void }) {
  const text = useText()
  return (
    <Sheet label={text.t('chooseCube')} onDismiss={onDismiss}>
      <h2 className="sheet-title format-title">{text.t('chooseCube')}</h2>
      <div className="format-rows">
        {allFormats.map((format) => {
          const n = format.size
          const selected = format.size === current.size
          return (
            <button
              key={n}
              type="button"
              className={`format-row${selected ? ' selected' : ''}`}
              aria-pressed={selected}
              aria-label={`${text.formatName(n)}, ${text.cubeSize(n)}, ${text.formatDetail(n)}`}
              onClick={() => onChoose(format)}
            >
              <FormatPreview format={format} />
              <span className="format-copy">
                <span className="format-name">{text.formatName(n)} · {text.cubeSize(n)}</span>
                <span className="caption">{text.formatDetail(n)}</span>
              </span>
              {selected && <Icon name="checkCircleRounded" size={20} color="#5B8CFF" />}
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}

const previews = new Map<number, CubeLevel>()
const camera = new CubeCamera()

/** A finished cube of the format, in the player's skin. */
function FormatPreview({ format }: { format: CubeFormat }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const skins = useAppearance()
  useLayoutEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = prepareCanvas(canvas, 64, 64, 0)
    if (!ctx) return
    let level = previews.get(format.size)
    if (!level) {
      level = CubePuzzles.generate(format, 20261015)
      previews.set(format.size, level)
    }
    const scene = CubeScene.build({
      size: format.size,
      camera,
      centre: { x: 32, y: 32 },
      scale: 64 / (format.size * 1.85),
      solids: [
        ...level.blocked.map((b) => new Solid({ kind: 'die', id: `die${b.y}`, cells: [b], colorKey: '' })),
        ...level.solution.map((p) => new Solid({ kind: 'piece', id: p.pieceId, cells: p.cells, colorKey: level.pieceById(p.pieceId).colorKey })),
      ],
    })
    paintCube(ctx, scene, skins, { showPlate: false, showBounds: false })
  }, [format, skins])
  return <canvas ref={ref} aria-hidden="true" className="format-preview" style={{ width: 64, height: 64 }} />
}

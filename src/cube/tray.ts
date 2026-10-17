import { css, white, withAlpha } from '../rendering/color'
import { roundedRect } from '../rendering/canvas'
import { CubeCamera, V3 } from './camera'
import { rectContains, rectHeight, rectWidth, type Pt, type Rect } from './geometry'
import { Shapes, type Shape } from './model'
import { paintCube, type CubeSkins } from './painter'
import { GamePalette } from './palette'
import { CubeScene, Solid, SolidMotion } from './scene'

/**
 * The tray's slots (`CubeTrayLayout`): [rows] rows (two on a phone), filled
 * column by column, at least four columns on screen when there are two rows
 * (more when wide, so slots stay about as wide as they are tall). A bigger
 * set scrolls sideways; a smaller one is centred. The web's side panel asks
 * for its own [rows] and [columnsOnScreen].
 */
export class CubeTrayLayout {
  readonly area: Rect
  readonly rows: number
  readonly columns: number
  readonly visibleColumns: number
  readonly contentWidth: number
  readonly slots: [string, Rect][]

  constructor(area: Rect, ids: readonly string[], scroll: number, rows = 2, columnsOnScreen?: number) {
    this.area = area
    this.rows = rows
    this.columns = Math.ceil(ids.length / rows)
    const slotHeight = rectHeight(area) / rows
    this.visibleColumns = columnsOnScreen ?? Math.max(4, Math.floor(rectWidth(area) / (slotHeight * 1.3)))
    const slotWidth = rectWidth(area) / this.visibleColumns
    this.contentWidth = this.columns * slotWidth
    const left = this.contentWidth < rectWidth(area)
      ? area.left + (rectWidth(area) - this.contentWidth) / 2
      : area.left - Math.min(Math.max(scroll, 0), this.maxScroll)
    this.slots = ids.map((id, i) => {
      const x = left + Math.floor(i / rows) * slotWidth
      const y = area.top + (i % rows) * slotHeight
      return [id, { left: x, top: y, right: x + slotWidth, bottom: y + slotHeight }]
    })
  }

  get maxScroll(): number {
    return Math.max(0, this.contentWidth - rectWidth(this.area))
  }

  get scrolls(): boolean {
    return this.maxScroll > 0
  }

  /** The slot under [point], among those inside the tray. */
  slotAt(point: Pt): string | null {
    if (!rectContains(this.area, point)) return null
    for (const [id, r] of this.slots) if (rectContains(r, point)) return id
    return null
  }
}

/** The fixed angle the tray shows its pieces from: they do not follow the
 * cube, working out how a piece has to go in is part of the puzzle. */
export const trayCamera = new CubeCamera(CubeCamera.restYaw, CubeCamera.restPitch)

/** A tray piece drawn by the cube renderer from the tray's fixed angle into
 * the box [width] × [height] at the origin (`CubeTrayPiecePainter`). */
export function paintTrayPiece(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  piece: { shape: Shape; colorKey: string; selected?: boolean; motion?: SolidMotion | null },
  skins: CubeSkins,
): void {
  if (piece.selected) {
    const slot = { left: 3, top: 3, right: width - 3, bottom: height - 3 }
    const path = roundedRect(slot, 14)
    ctx.fillStyle = css(withAlpha(white, 0.05))
    ctx.fill(path)
    ctx.lineWidth = 1.2
    ctx.strokeStyle = css(withAlpha(GamePalette.accent, 0.6))
    ctx.stroke(path)
  }
  const e = Shapes.extent(piece.shape)
  const span = Math.sqrt(e.x * e.x + e.y * e.y + e.z * e.z)
  // Small pieces are not blown up past the size of a three-cell one.
  const s = Math.min(width, height) / (Math.max(span, 3.2) + 0.8)
  // Centre the shape: the scene centres a 3-cell cube on the origin.
  const shift = new V3((3 - e.x) / 2, (3 - e.y) / 2, (3 - e.z) / 2)
  const scene = CubeScene.build({
    size: 3,
    solids: [new Solid({ kind: 'piece', id: 'tray', cells: piece.shape, colorKey: piece.colorKey, offset: shift, motion: piece.motion ?? null })],
    camera: trayCamera,
    centre: { x: width / 2, y: height / 2 },
    scale: s,
  })
  paintCube(ctx, scene, skins, { showPlate: false, showBounds: false })
}

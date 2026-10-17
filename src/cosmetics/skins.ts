import { argb, rgba, type Rgba } from '../rendering/color'

/**
 * The cosmetic catalog of the mobile app (`lib/game/cosmetics`), value for
 * value. Skins are data only; every renderer reads them, so the web and the
 * mobile app draw the same pieces, dice and boards.
 */

export type PieceFinish = 'legacy' | 'gloss' | 'neon' | 'ceramic' | 'satinMetal' | 'crystal'

/** `PieceMaterial`: lengths are fractions of a cell, alphas 0..1. */
export interface PieceMaterial {
  readonly finish: PieceFinish
  readonly depth: number
  readonly depthShade: number
  readonly faceLift: number
  readonly faceDrop: number
  readonly edgeWidth: number
  readonly edgeLight: number
  readonly shadeWidth: number
  readonly edgeShade: number
  readonly sheen: number
  readonly sheenDepth: number
  readonly rim: number
  readonly core: number
  readonly rimWidth: number
  readonly rimLift: number
  readonly innerGlow: number
  readonly innerGlowWidth: number
  readonly halo: number
}

const materialDefaults: Omit<PieceMaterial, 'finish'> = {
  depth: 0.055,
  depthShade: 0.17,
  faceLift: 0.08,
  faceDrop: 0.06,
  edgeWidth: 0.05,
  edgeLight: 0.42,
  shadeWidth: 0.07,
  edgeShade: 0.16,
  sheen: 0.18,
  sheenDepth: 0.6,
  rim: 0.3,
  core: 0.2,
  rimWidth: 0.05,
  rimLift: 0.25,
  innerGlow: 0.5,
  innerGlowWidth: 0.22,
  halo: 0.3,
}

function material(finish: PieceFinish, overrides: Partial<PieceMaterial> = {}): PieceMaterial {
  return { ...materialDefaults, ...overrides, finish }
}

export const materials = {
  /** Brand artwork only (the Q mark): the original faceted look. */
  brand: material('legacy'),
  classic: material('gloss'),
  neon: material('neon', { depth: 0.05, depthShade: 0.08, faceLift: 0.06, faceDrop: 0.04, sheen: 0.1, sheenDepth: 0.5 }),
  porcelain: material('ceramic', {
    depth: 0.035, depthShade: 0.12, faceLift: 0.035, faceDrop: 0.025, edgeWidth: 0.045, edgeLight: 0.12,
    edgeShade: 0.08, sheen: 0.04, rim: 0.1,
  }),
  ember: material('satinMetal', {
    depth: 0.075, depthShade: 0.15, faceLift: 0.025, faceDrop: 0.035, edgeWidth: 0.055, edgeLight: 0.38,
    shadeWidth: 0.09, edgeShade: 0.22, sheen: 0, rim: 0.25,
  }),
  prism: material('crystal', {
    depth: 0.08, depthShade: 0.2, faceLift: 0.13, faceDrop: 0.09, edgeWidth: 0.075, edgeLight: 0.62,
    shadeWidth: 0.09, edgeShade: 0.25, sheen: 0.3, sheenDepth: 0.75, rim: 0.55,
  }),
} as const satisfies Record<string, PieceMaterial>

export type CosmeticSlot = 'pieces' | 'dice' | 'board'

export interface PieceSkin {
  readonly slot: 'pieces'
  readonly id: string
  readonly name: string
  readonly material: PieceMaterial
  readonly colors: Readonly<Record<string, Rgba>>
}

export type DiceSurface = 'smooth' | 'ceramic' | 'stone' | 'crystal'

export interface DiceSkin {
  readonly slot: 'dice'
  readonly id: string
  readonly name: string
  readonly faceTop: Rgba
  readonly faceBottom: Rgba
  readonly side: Rgba
  readonly iconSide: Rgba
  readonly shade: Rgba
  readonly label: Rgba
  readonly pip: Rgba
  readonly rim: Rgba
  readonly rimAlpha: number
  readonly sheen: number
  readonly outline: Rgba | null
  readonly glow: Rgba | null
  readonly surface: DiceSurface
}

export interface BoardSkin {
  readonly slot: 'board'
  readonly id: string
  readonly name: string
  readonly frameTop: Rgba
  readonly frameBottom: Rgba
  readonly frameEdge: Rgba
  readonly shadow: Rgba
  readonly frameGlow: Rgba | null
  readonly well: Rgba
  readonly wellShadow: Rgba
  readonly lipTop: Rgba
  readonly lipBottom: Rgba
}

export type CosmeticItem = PieceSkin | DiceSkin | BoardSkin

export interface ThemePreset {
  readonly id: string
  readonly name: string
  /** Stars needed to own the preset; zero means free. */
  readonly price: number
  readonly pieceSkinId: string
  readonly diceSkinId: string
  readonly boardSkinId: string
}

const pieceIds = ['line4', 'elbow4', 'tee', 'square', 'zigzag', 'flare', 'elbow3', 'domino'] as const

function palette(values: readonly number[]): Record<string, Rgba> {
  return Object.fromEntries(pieceIds.map((id, index) => [id, argb(values[index])]))
}

function dice(skin: Omit<DiceSkin, 'slot' | 'outline' | 'glow' | 'surface'> & Partial<Pick<DiceSkin, 'outline' | 'glow' | 'surface'>>): DiceSkin {
  return { slot: 'dice', outline: null, glow: null, surface: 'smooth', ...skin }
}

function board(skin: Omit<BoardSkin, 'slot' | 'frameGlow'> & Partial<Pick<BoardSkin, 'frameGlow'>>): BoardSkin {
  return { slot: 'board', frameGlow: null, ...skin }
}

export const pieceSkins: readonly PieceSkin[] = [
  {
    slot: 'pieces', id: 'classic', name: 'Classic', material: materials.classic,
    colors: palette([0xff2fd4ee, 0xffff9447, 0xffa98bff, 0xffffcf3f, 0xff3fdc9a, 0xff5b8cff, 0xffff6fb1, 0xffb5e84a]),
  },
  {
    slot: 'pieces', id: 'neon', name: 'Neon', material: materials.neon,
    colors: palette([0xff1ae5ff, 0xffff7a1a, 0xffb070ff, 0xffffe01a, 0xff1aff8c, 0xff3d6dff, 0xffff2e9a, 0xffb8ff1a]),
  },
  {
    slot: 'pieces', id: 'porcelain', name: 'Porcelain', material: materials.porcelain,
    colors: palette([0xff83ceda, 0xffe9a77b, 0xffbe9bdd, 0xffebd176, 0xff85cda8, 0xff86a6e0, 0xffe59cb8, 0xffbdce80]),
  },
  {
    slot: 'pieces', id: 'ember', name: 'Ember', material: materials.ember,
    colors: palette([0xff68b4bd, 0xffd68b59, 0xffa184b8, 0xffd8b64d, 0xff69ad83, 0xff7295c5, 0xffca7e9c, 0xffa3b665]),
  },
  {
    slot: 'pieces', id: 'prism', name: 'Prism', material: materials.prism,
    colors: palette([0xff26c5d9, 0xffef8738, 0xffa573e8, 0xfff0c32e, 0xff2acb83, 0xff587ee8, 0xffe95c9d, 0xffa0cf38]),
  },
]

export const diceSkins: readonly DiceSkin[] = [
  dice({
    id: 'ivory', name: 'Ivory',
    faceTop: argb(0xfff7f4ec), faceBottom: argb(0xffdcd7cb), side: argb(0xffbfb6a0), iconSide: argb(0xffb9b1a2),
    shade: argb(0xff7a7263), label: argb(0xff3a3d45), pip: argb(0xff2b3a67), rim: argb(0xffffffff), rimAlpha: 0.3, sheen: 0.28,
  }),
  dice({
    id: 'midnight', name: 'Midnight',
    faceTop: argb(0xff1d2331), faceBottom: argb(0xff121620), side: argb(0xff080a10), iconSide: argb(0xff0b0e15),
    shade: argb(0xff04050a), label: argb(0xff7df3ff), pip: argb(0xff5cebff), rim: argb(0xff5ce1ff), rimAlpha: 0.55, sheen: 0.12,
    outline: argb(0x8c22d3ee), glow: argb(0x3322d3ee),
  }),
  dice({
    id: 'frost', name: 'Frost', surface: 'ceramic',
    faceTop: argb(0xfff1f7fc), faceBottom: argb(0xffcbdce9), side: argb(0xff8da7bd), iconSide: argb(0xff8da7bd),
    shade: argb(0xff657f99), label: argb(0xff263d53), pip: argb(0xff263d53), rim: argb(0xfff5faff), rimAlpha: 0.4, sheen: 0.16,
  }),
  dice({
    id: 'sandstone', name: 'Sandstone', surface: 'stone',
    faceTop: argb(0xfff0d3a1), faceBottom: argb(0xffd5af77), side: argb(0xff94704b), iconSide: argb(0xff94704b),
    shade: argb(0xff6b5037), label: argb(0xff3f291c), pip: argb(0xff3f291c), rim: argb(0xffffdca3), rimAlpha: 0.25, sheen: 0,
  }),
  dice({
    id: 'amethyst', name: 'Amethyst', surface: 'crystal',
    faceTop: argb(0xff44335d), faceBottom: argb(0xff291e3d), side: argb(0xff150f24), iconSide: argb(0xff150f24),
    shade: argb(0xff100b1c), label: argb(0xfff1deff), pip: argb(0xfff1deff), rim: argb(0xffd0a4ff), rimAlpha: 0.5, sheen: 0.24,
    outline: argb(0x998f6bb6),
  }),
]

export const boardSkins: readonly BoardSkin[] = [
  board({
    id: 'graphite', name: 'Graphite',
    frameTop: argb(0xff30333b), frameBottom: argb(0xff24272d), frameEdge: argb(0x14ffffff), shadow: argb(0xff000000),
    well: argb(0xff1b1d22), wellShadow: rgba(0, 0, 0, 0.6), lipTop: rgba(1, 1, 1, 0), lipBottom: rgba(1, 1, 1, 0.07),
  }),
  board({
    id: 'void', name: 'Void',
    frameTop: argb(0xff15171f), frameBottom: argb(0xff0b0c11), frameEdge: argb(0x5222d3ee), shadow: argb(0xff000000),
    frameGlow: argb(0x1c22d3ee), well: argb(0xff050608), wellShadow: rgba(0, 0, 0, 0.8),
    lipTop: argb(0x0022d3ee), lipBottom: argb(0x3322d3ee),
  }),
  board({
    id: 'slate', name: 'Slate',
    frameTop: argb(0xff384b5d), frameBottom: argb(0xff263544), frameEdge: argb(0xff536b80), shadow: argb(0xff070f18),
    well: argb(0xff17222d), wellShadow: argb(0xa606101a), lipTop: argb(0x006fa0c3), lipBottom: argb(0x386fa0c3),
  }),
  board({
    id: 'bronze', name: 'Bronze',
    frameTop: argb(0xff503a30), frameBottom: argb(0xff30221d), frameEdge: argb(0xff8c6545), shadow: argb(0xff160b06),
    well: argb(0xff201713), wellShadow: argb(0xb3090503), lipTop: argb(0x00e8b47b), lipBottom: argb(0x2ee8b47b),
  }),
  board({
    id: 'indigo', name: 'Indigo',
    frameTop: argb(0xff322d50), frameBottom: argb(0xff1b1932), frameEdge: argb(0xff756796), shadow: argb(0xff090613),
    well: argb(0xff100e1e), wellShadow: argb(0xb305030e), lipTop: argb(0x00bea1f5), lipBottom: argb(0x33bea1f5),
  }),
]

export const presets: readonly ThemePreset[] = [
  { id: 'classic', name: 'Qybeq Classic', price: 0, pieceSkinId: 'classic', diceSkinId: 'ivory', boardSkinId: 'graphite' },
  { id: 'neon', name: 'Neon', price: 12, pieceSkinId: 'neon', diceSkinId: 'midnight', boardSkinId: 'void' },
  { id: 'porcelain', name: 'Porcelain', price: 24, pieceSkinId: 'porcelain', diceSkinId: 'frost', boardSkinId: 'slate' },
  { id: 'ember', name: 'Ember', price: 39, pieceSkinId: 'ember', diceSkinId: 'sandstone', boardSkinId: 'bronze' },
  { id: 'prism', name: 'Prism', price: 57, pieceSkinId: 'prism', diceSkinId: 'amethyst', boardSkinId: 'indigo' },
]

/** The Q mark's die: part of the brand, never follows the player's dice. */
export const brandDie: DiceSkin = dice({
  id: 'qybeq-mark', name: 'Qybeq mark',
  faceTop: argb(0xfff7f4ec), faceBottom: argb(0xffdcd7cb), side: argb(0xffbfb6a0), iconSide: argb(0xffb9b1a2),
  shade: argb(0xff7a7263), label: argb(0xff3a3d45), pip: argb(0xff3a3d45), rim: argb(0xffffffff), rimAlpha: 0.3, sheen: 0.28,
})

export const pieceFallbackColor = argb(0xff8d93a0)

export function pieceColor(skin: PieceSkin, pieceId: string): Rgba {
  return skin.colors[pieceId] ?? pieceFallbackColor
}

export function findPieceSkin(id: string | null | undefined): PieceSkin {
  return pieceSkins.find((skin) => skin.id === id) ?? pieceSkins[0]
}

export function findDiceSkin(id: string | null | undefined): DiceSkin {
  return diceSkins.find((skin) => skin.id === id) ?? diceSkins[0]
}

export function findBoardSkin(id: string | null | undefined): BoardSkin {
  return boardSkins.find((skin) => skin.id === id) ?? boardSkins[0]
}

export function findPreset(id: string | null | undefined): ThemePreset | undefined {
  return presets.find((preset) => preset.id === id)
}

export function itemsFor(slot: CosmeticSlot): readonly CosmeticItem[] {
  return slot === 'pieces' ? pieceSkins : slot === 'dice' ? diceSkins : boardSkins
}

/** The preset that owns [item], if any. */
export function presetFor(item: CosmeticItem): ThemePreset | undefined {
  return presets.find((preset) => skinIdFor(preset, item.slot) === item.id)
}

export function skinIdFor(preset: ThemePreset, slot: CosmeticSlot): string {
  return slot === 'pieces' ? preset.pieceSkinId : slot === 'dice' ? preset.diceSkinId : preset.boardSkinId
}

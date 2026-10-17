import { createContext, useContext } from 'react'
import {
  boardSkins,
  diceSkins,
  findPreset,
  pieceSkins,
  presetFor,
  presets,
  skinIdFor,
  type BoardSkin,
  type CosmeticItem,
  type CosmeticSlot,
  type DiceSkin,
  type PieceSkin,
  type ThemePreset,
} from './skins'
import { storage } from '../platform/storage'

/**
 * The player's look: one skin per slot, chosen independently (mobile
 * `AppearanceSettings`). Only ids are stored; an unknown or locked id falls
 * back to Qybeq Classic for that slot, unreadable data to Qybeq Classic.
 */
export interface Appearance {
  readonly pieces: PieceSkin
  readonly dice: DiceSkin
  readonly board: BoardSkin
}

export const classicAppearance: Appearance = { pieces: pieceSkins[0], dice: diceSkins[0], board: boardSkins[0] }

export const appearanceStorageKey = 'qybeq.appearance.v1'

/** Whether [item] can be used: free, or part of a preset the player owns. */
export function isItemUnlocked(item: CosmeticItem, owned: ReadonlySet<string>): boolean {
  const preset = presetFor(item)
  return !preset || preset.price === 0 || owned.has(preset.id)
}

export function isPresetUnlocked(preset: ThemePreset, owned: ReadonlySet<string>): boolean {
  return preset.price === 0 || owned.has(preset.id)
}

export function presetAppearance(preset: ThemePreset): Appearance {
  return {
    pieces: pieceSkins.find((skin) => skin.id === preset.pieceSkinId) ?? classicAppearance.pieces,
    dice: diceSkins.find((skin) => skin.id === preset.diceSkinId) ?? classicAppearance.dice,
    board: boardSkins.find((skin) => skin.id === preset.boardSkinId) ?? classicAppearance.board,
  }
}

export function loadAppearance(owned: ReadonlySet<string>): Appearance {
  const raw = readStored()
  if (!raw) return classicAppearance
  let ids: Partial<Record<CosmeticSlot, unknown>> = {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ids = parsed as typeof ids
  } catch {
    // Earlier versions stored a whole-theme id such as "neon".
    const preset = findPreset(raw)
    if (preset) ids = { pieces: preset.pieceSkinId, dice: preset.diceSkinId, board: preset.boardSkinId }
  }
  const resolve = <T extends CosmeticItem>(items: readonly T[], id: unknown, fallback: T): T => {
    const item = items.find((candidate) => candidate.id === id)
    return item && isItemUnlocked(item, owned) ? item : fallback
  }
  return {
    pieces: resolve(pieceSkins, ids.pieces, classicAppearance.pieces),
    dice: resolve(diceSkins, ids.dice, classicAppearance.dice),
    board: resolve(boardSkins, ids.board, classicAppearance.board),
  }
}

function readStored(): string | null {
  try {
    return storage.getItem(appearanceStorageKey)
  } catch {
    return null
  }
}

export function saveAppearance(appearance: Appearance): void {
  try {
    storage.setItem(
      appearanceStorageKey,
      JSON.stringify({ pieces: appearance.pieces.id, dice: appearance.dice.id, board: appearance.board.id }),
    )
  } catch {
    /* Optional storage. */
  }
}

export function withItem(appearance: Appearance, item: CosmeticItem): Appearance {
  return item.slot === 'pieces'
    ? { ...appearance, pieces: item }
    : item.slot === 'dice'
      ? { ...appearance, dice: item }
      : { ...appearance, board: item }
}

export function selectedFor(appearance: Appearance, slot: CosmeticSlot): CosmeticItem {
  return appearance[slot]
}

export function matchesPreset(appearance: Appearance, preset: ThemePreset): boolean {
  return (['pieces', 'dice', 'board'] as const).every((slot) => appearance[slot].id === skinIdFor(preset, slot))
}

/** The preset whose three skins are exactly the current ones, if any. */
export function activePreset(appearance: Appearance): ThemePreset | undefined {
  return presets.find((preset) => matchesPreset(appearance, preset))
}

export const AppearanceContext = createContext<Appearance>(classicAppearance)

export function useAppearance(): Appearance {
  return useContext(AppearanceContext)
}

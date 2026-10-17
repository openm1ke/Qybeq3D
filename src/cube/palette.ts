import { argb } from '../rendering/color'

/** The app colours (`GamePalette`). The board, dice and pieces take theirs
 * from the player's skins. */
export const GamePalette = {
  background: argb(0xff0d0e11),
  backgroundGlow: argb(0xff1b1e25),
  invalid: argb(0xffff4d5e),
  success: argb(0xff6cf2d2),
  textPrimary: argb(0xfff2f3f5),
  textSecondary: argb(0xff8d93a0),
  textMuted: argb(0xff7a808c),
  surface: argb(0xff17191e),
  surfaceRaised: argb(0xff1e2127),
  hairline: argb(0x1affffff),
  accent: argb(0xff5b8cff),
}

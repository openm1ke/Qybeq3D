import { useState, type CSSProperties, type ReactNode } from 'react'
import type { DiceSkin } from '../cosmetics/skins'
import { DieIcon } from './GameCanvas'
import { Icon, type IconName } from './Icon'

/**
 * The mobile action family (`lib/ui/actions.dart`): a slight press scale,
 * one semantics node per action and generous hit areas.
 */

function usePressed() {
  const [pressed, setPressed] = useState(false)
  const handlers = {
    onPointerDown: () => setPressed(true),
    onPointerUp: () => setPressed(false),
    onPointerLeave: () => setPressed(false),
    onPointerCancel: () => setPressed(false),
  }
  return [pressed, handlers] as const
}

interface ActionProps {
  label: string
  onPress?: () => void
  icon?: IconName
  detail?: string
  compact?: boolean
  ariaLabel?: string
  className?: string
  style?: CSSProperties
}

export function PrimaryAction({ label, onPress, icon, detail, compact = false, ariaLabel, className, style }: ActionProps) {
  const [pressed, handlers] = usePressed()
  return (
    <button
      type="button"
      className={['q-action q-primary', compact ? 'compact' : '', detail ? 'with-detail' : '', pressed ? 'pressed' : '', className].filter(Boolean).join(' ')}
      disabled={!onPress}
      onClick={onPress}
      aria-label={ariaLabel ?? (detail ? `${label}, ${detail}` : label)}
      style={style}
      {...handlers}
    >
      <ActionLabel label={label} icon={icon} detail={detail} />
    </button>
  )
}

export function SecondaryAction({ label, onPress, icon, compact = false, iconOnly = false, ariaLabel, className, style }: ActionProps & { iconOnly?: boolean }) {
  const [pressed, handlers] = usePressed()
  return (
    <button
      type="button"
      className={['q-action q-secondary', compact ? 'compact' : '', iconOnly ? 'icon-only' : '', pressed ? 'pressed' : '', className].filter(Boolean).join(' ')}
      disabled={!onPress}
      onClick={onPress}
      aria-label={ariaLabel ?? label}
      style={style}
      {...handlers}
    >
      {iconOnly && icon ? <Icon name={icon} size={22} /> : <ActionLabel label={label} icon={icon} />}
    </button>
  )
}

export function QuietAction({ label, onPress, icon, ariaLabel, className, style }: ActionProps) {
  const [pressed, handlers] = usePressed()
  return (
    <button
      type="button"
      className={['q-action q-quiet', pressed ? 'pressed' : '', className].filter(Boolean).join(' ')}
      disabled={!onPress}
      onClick={onPress}
      aria-label={ariaLabel ?? label}
      style={style}
      {...handlers}
    >
      <ActionLabel label={label} icon={icon} />
    </button>
  )
}

function ActionLabel({ label, icon, detail }: { label: string; icon?: IconName; detail?: string }) {
  const title = (
    <span className="q-action-title">
      {icon && <Icon name={icon} size={20} />}
      <span className="q-action-text">{label}</span>
    </span>
  )
  if (!detail) return title
  return (
    <span className="q-action-stack">
      {title}
      <span className="q-action-detail">{detail}</span>
    </span>
  )
}

/** The glowing pill that starts a game, with a die in the dice skin. */
export function RollDiceButton({ label, enabled, onPress, dice, buttonRef }: {
  label: string
  enabled: boolean
  onPress: () => void
  dice: DiceSkin
  buttonRef?: React.Ref<HTMLButtonElement>
}) {
  const [pressed, handlers] = usePressed()
  return (
    <button
      ref={buttonRef}
      type="button"
      className={['roll-dice-button', pressed ? 'pressed' : ''].filter(Boolean).join(' ')}
      disabled={!enabled}
      onClick={onPress}
      aria-label={label}
      {...handlers}
    >
      <DieIcon size={30} skin={dice} />
      <span>{label}</span>
    </button>
  )
}

export function Sheet({ children, onDismiss, label }: { children: ReactNode; onDismiss: () => void; label: string }) {
  return (
    <div className="q-sheet-scrim" onClick={onDismiss} role="presentation">
      <div className="q-sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(event) => event.stopPropagation()}>
        <div className="q-sheet-handle" aria-hidden="true" />
        {children}
      </div>
    </div>
  )
}

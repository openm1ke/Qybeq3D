import { useEffect, type ReactNode } from 'react'
import { Icon } from './Icon'

/** Secondary screens (mobile `ScreenFrame`): backdrop, a slim bar with Back
 * and a centred title. Escape goes back too. */
export function ScreenFrame({ title, backLabel, onBack, trailing, children, className }: {
  title: string
  backLabel: string
  onBack: () => void
  trailing?: ReactNode
  children: ReactNode
  className?: string
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('.q-sheet-scrim')) onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])
  return (
    <main className={['screen-frame', className].filter(Boolean).join(' ')}>
      <div className="app-backdrop" aria-hidden="true" />
      <header className="screen-bar">
        <button type="button" className="screen-back" onClick={onBack} aria-label={backLabel}>
          <Icon name="chevronLeftRounded" size={30} />
        </button>
        <h1>{title}</h1>
        <span className="screen-bar-trailing">{trailing}</span>
      </header>
      <div className="screen-scroll">{children}</div>
    </main>
  )
}

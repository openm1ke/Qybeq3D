import { useState } from 'react'
import { Icon, type IconName } from '../../components/Icon'
import { PrimaryAction, SecondaryAction, Sheet } from '../../components/ui'
import { formatClock, useText } from '../../i18n/text'
import type { CompletionAward } from '../../progress/playerProgress'
import type { RewardOutcome } from './cubeHelp'

export type GameMenuAction = 'resume' | 'restart' | 'newPuzzle' | 'viewSolution' | 'howToPlay' | 'settings' | 'mainMenu' | 'autoSolve'

/** The pause menu (mobile `GameMenuSheet`). Dismissing it means "resume". */
export function GameMenuSheet({ status, canRestart, canViewSolution, solutionLocked, developer, onChoose }: {
  status: string
  canRestart: boolean
  canViewSolution: boolean
  /** Needs a video first: marked with a small play sign. */
  solutionLocked: boolean
  developer: boolean
  onChoose: (action: GameMenuAction) => void
}) {
  const text = useText()
  return (
    <Sheet label={text.t('paused')} onDismiss={() => onChoose('resume')}>
      <div className="cube-menu-head">
        <h2>{text.t('paused')}</h2>
        <span className="caption">{status}</span>
      </div>
      <div className="sheet-actions">
        <PrimaryAction label={text.t('resume')} icon="playArrowRounded" onPress={() => onChoose('resume')} />
        <div className="cube-menu-rows">
          <MenuRow icon="replayRounded" label={text.t('restartPuzzle')} onPress={canRestart ? () => onChoose('restart') : undefined} />
          <MenuRow icon="casinoOutlined" label={text.t('newPuzzle')} onPress={() => onChoose('newPuzzle')} />
          <MenuRow
            icon="extensionOutlined"
            label={text.t('viewSolution')}
            ariaLabel={solutionLocked ? text.t('viewSolutionLocked') : undefined}
            trailing={solutionLocked ? <Icon name="playCircleFillRounded" size={18} color="#5B8CFF" /> : null}
            onPress={canViewSolution ? () => onChoose('viewSolution') : undefined}
          />
          <MenuRow icon="helpOutlineRounded" label={text.t('howToPlay')} onPress={() => onChoose('howToPlay')} />
          <MenuRow icon="tuneRounded" label={text.t('settings')} onPress={() => onChoose('settings')} />
          <MenuRow icon="gridViewRounded" label={text.t('mainMenu')} onPress={() => onChoose('mainMenu')} />
          {developer && (
            <MenuRow icon="extensionOutlined" label={text.t('autoSolve')} onPress={canViewSolution ? () => onChoose('autoSolve') : undefined} />
          )}
        </div>
      </div>
    </Sheet>
  )
}

function MenuRow({ icon, label, ariaLabel, trailing, onPress }: { icon: IconName; label: string; ariaLabel?: string; trailing?: React.ReactNode; onPress?: () => void }) {
  return (
    <button type="button" className="menu-row" onClick={onPress} disabled={!onPress} aria-label={ariaLabel}>
      <Icon name={icon} size={22} />
      <span className="cube-menu-label">{label}</span>
      {trailing}
    </button>
  )
}

/** "Are you sure?" with the confirming action first (mobile `confirmAction`). */
export function ConfirmSheet({ title, body, confirm, onConfirm, onCancel }: { title: string; body: string; confirm: string; onConfirm: () => void; onCancel: () => void }) {
  const text = useText()
  return (
    <Sheet label={title} onDismiss={onCancel}>
      <h2 className="sheet-title">{title}</h2>
      <p className="sheet-body">{body}</p>
      <div className="sheet-actions">
        <PrimaryAction label={confirm} compact onPress={onConfirm} />
        <SecondaryAction label={text.t('cancel')} compact onPress={onCancel} />
      </div>
    </Sheet>
  )
}

/**
 * "Watch a short video for …" (mobile `RewardedOfferSheet`): closes with
 * `true` once the reward is granted; any other outcome stays here as a calm
 * status with Retry / Close.
 */
export function RewardedOfferSheet({ kind, watch, onClose }: {
  kind: 'hint' | 'solution'
  watch: () => Promise<RewardOutcome>
  onClose: (granted: boolean) => void
}) {
  const text = useText()
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<RewardOutcome | null>(null)
  const title = text.t(kind === 'hint' ? 'rewardedHintTitle' : 'solutionOfferTitle')
  const body = text.t(kind === 'hint' ? 'rewardedHintBody' : 'solutionOfferBody')
  const run = async () => {
    if (busy) return // a second tap never opens a second video
    setBusy(true)
    setOutcome(null)
    const result = await watch()
    if (result === 'granted') return onClose(true)
    setBusy(false)
    setOutcome(result)
  }
  const status = outcome === null || outcome === 'granted' ? null : text.t({
    dismissed: 'videoDismissed',
    unavailable: 'videoUnavailable',
    failed: 'videoFailed',
    expired: 'videoExpired',
  }[outcome])
  return (
    <Sheet label={title} onDismiss={busy ? () => {} : () => onClose(false)}>
      <div className="reward-offer">
        <span className="reward-badge" aria-hidden="true">
          <Icon name={kind === 'hint' ? 'lightbulbOutlineRounded' : 'extensionOutlined'} size={26} />
          <Icon name="playCircleFillRounded" size={15} className="reward-badge-play" />
        </span>
        <h2 className="reward-title">{title}</h2>
        <p className="reward-body">{body}</p>
        {status && (
          <p className="reward-status" role="status">
            <Icon name="infoOutlineRounded" size={18} />
            <span>{status}</span>
          </p>
        )}
        <div className="reward-actions">
          {outcome !== 'expired' && (
            <PrimaryAction
              label={busy ? text.t('openingVideo') : outcome === null ? text.t('watchVideo') : text.t('retry')}
              icon={busy ? undefined : outcome === null ? 'playArrowRounded' : 'refreshRounded'}
              onPress={busy ? undefined : () => void run()}
            />
          )}
          <SecondaryAction label={outcome === null ? text.t('notNow') : text.t('close')} onPress={busy ? undefined : () => onClose(false)} />
        </div>
      </div>
    </Sheet>
  )
}

/** Shown once the cube is solved (mobile `ResultPanel`); a compact two-row
 * layout on short areas so the cube never has to shrink. */
export function ResultPanel({ timeMs, award, assistanceUsed, compact, onNewPuzzle, onViewBoard, onMainMenu }: {
  timeMs: number | null
  award: CompletionAward | null
  assistanceUsed: boolean
  compact: boolean
  onNewPuzzle: () => void
  onViewBoard: () => void
  onMainMenu: () => void
}) {
  const text = useText()
  const subtitle = timeMs === null ? null : text.t('solvedIn', { time: formatClock(timeMs) })
  if (compact) {
    return (
      <div className="result-panel cube-result compact" role="status">
        <div className="cube-result-line">
          <Icon name="checkCircleRounded" size={22} color="#6CF2D2" />
          <h2 className="result-title">{text.t('puzzleComplete')}</h2>
          {subtitle && <p className="result-time">{subtitle}</p>}
        </div>
        <div className="cube-result-row">
          <PrimaryAction label={text.t('newPuzzle')} compact onPress={onNewPuzzle} style={{ flex: 5 }} />
          <SecondaryAction label={text.t('viewBoard')} compact onPress={onViewBoard} style={{ flex: 4 }} />
          <SecondaryAction label={text.t('mainMenu')} icon="gridViewRounded" iconOnly compact onPress={onMainMenu} style={{ width: 48, flex: 'none' }} />
        </div>
      </div>
    )
  }
  return (
    <div className="result-panel cube-result" role="status">
      {award ? (
        <div className="result-stars" aria-label={text.stars(award.attemptStars)}>
          <div className="result-star-row">
            {[0, 1, 2].map((i) => <Icon key={i} name={i < award.attemptStars ? 'starRounded' : 'starOutlineRounded'} size={32} color={i < award.attemptStars ? '#5B8CFF' : '#7A808C'} />)}
          </div>
          <span className="result-balance">
            {award.earnedDelta === 0
              ? text.t('starBalance', { count: award.availableStars })
              : `${text.t('earnedStars', { count: award.earnedDelta })} · ${text.t('starBalance', { count: award.availableStars })}`}
          </span>
        </div>
      ) : (
        <Icon name="checkCircleRounded" size={34} color="#6CF2D2" />
      )}
      <h2 className="result-title">{text.t('puzzleComplete')}</h2>
      {subtitle && <p className="result-time">{subtitle}</p>}
      {award && <p className="caption">{assistanceUsed ? text.t('assistedResult') : text.t('noAssistance')}</p>}
      <div className="result-actions">
        <PrimaryAction label={text.t('newPuzzle')} onPress={onNewPuzzle} />
        <div className="result-secondary">
          <SecondaryAction label={text.t('viewBoard')} compact onPress={onViewBoard} />
          <SecondaryAction label={text.t('mainMenu')} compact onPress={onMainMenu} />
        </div>
      </div>
    </div>
  )
}

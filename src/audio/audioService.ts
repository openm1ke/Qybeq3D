import { platform } from '../platform'
import { storage } from '../platform/storage'

export interface AudioSettings {
  musicEnabled: boolean
  effectsEnabled: boolean
  musicVolume: number
}

const settingsKey = 'qybeq.audio.v1'
const musicTracks = ['./audio/quiet_geometry.mp3', './audio/glass_horizon.mp3', './audio/soft_circuit.mp3']
const effects = {
  dice: ['./audio/dice_roll.wav', .34],
  pickup: ['./audio/piece_pickup.wav', .38],
  place: ['./audio/piece_place.wav', .48],
  turn: ['./audio/piece_turn.wav', .34],
  reject: ['./audio/piece_reject.wav', .38],
  complete: ['./audio/puzzle_complete.wav', .58],
} as const

export type EffectName = keyof typeof effects

export function loadAudioSettings(): AudioSettings {
  try {
    const value = JSON.parse(storage.getItem(settingsKey) ?? '{}') as Partial<AudioSettings>
    return {
      musicEnabled: value.musicEnabled ?? true,
      effectsEnabled: value.effectsEnabled ?? true,
      musicVolume: typeof value.musicVolume === 'number' ? Math.max(0, Math.min(1, value.musicVolume)) : .1,
    }
  } catch {
    return { musicEnabled: true, effectsEnabled: true, musicVolume: .1 }
  }
}

export function saveAudioSettings(settings: AudioSettings): void {
  storage.setItem(settingsKey, JSON.stringify(settings))
}

/**
 * Music and effects through Web Audio only. Media elements (`<audio>`)
 * register with the browser's media session, which shows a system player
 * (Yandex Games requirements 1.6.1.6 / 1.6.2.5); decoded buffers played
 * through an AudioContext never do.
 *
 * The context is suspended whenever the game must be silent — the tab is
 * hidden (1.3), the platform paused the game or a video ad plays (4.7) —
 * which also holds the music where it was.
 */
class WebGameAudio {
  private settings = loadAudioSettings()
  private context: AudioContext | null = null
  private musicGain: GainNode | null = null
  private effectsGain: GainNode | null = null
  private buffers = new Map<string, Promise<AudioBuffer | null>>()
  private music: AudioBufferSourceNode | null = null
  private musicToken = 0
  private trackIndex = 0
  private menuOpen = false
  private visible = typeof document === 'undefined' || !document.hidden

  constructor() {
    if (typeof document === 'undefined') return
    document.addEventListener('visibilitychange', () => {
      this.visible = !document.hidden
      this.sync()
    })
    window.addEventListener('pagehide', () => {
      this.visible = false
      this.sync()
    })
    window.addEventListener('pageshow', () => {
      this.visible = !document.hidden
      this.sync()
    })
    platform.onPauseChange(() => this.sync())
  }

  configure(settings: AudioSettings): void {
    this.settings = settings
    this.sync()
  }

  /** Keeps the background music silent while an in-game sheet is open. */
  setMenuOpen(open: boolean): void {
    this.menuOpen = open
    this.sync()
  }

  /**
   * Browsers start audio only from a user gesture: the first tap or key
   * creates the context; later ones resume it if the system interrupted it.
   */
  unlock(): void {
    if (!this.context) {
      const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Context) return
      try {
        this.context = new Context()
      } catch {
        return
      }
      this.musicGain = this.context.createGain()
      this.musicGain.connect(this.context.destination)
      this.effectsGain = this.context.createGain()
      this.effectsGain.connect(this.context.destination)
      for (const [source] of Object.values(effects)) void this.load(source)
    }
    this.sync()
  }

  private get audible(): boolean {
    return this.visible && !platform.paused && !this.menuOpen
  }

  private sync(): void {
    const context = this.context
    if (!context || !this.musicGain) return
    if (!this.audible) {
      if (context.state === 'running') void context.suspend().catch(() => undefined)
      return
    }
    if (context.state !== 'running') void context.resume().catch(() => undefined)
    this.musicGain.gain.value = this.settings.musicVolume * .32
    if (this.settings.musicEnabled && !this.music) void this.startMusic()
    if (!this.settings.musicEnabled && this.music) this.stopMusic()
  }

  private load(source: string): Promise<AudioBuffer | null> {
    let pending = this.buffers.get(source)
    if (!pending) {
      const context = this.context
      pending = context
        ? fetch(source)
            .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(String(response.status)))))
            .then((data) => context.decodeAudioData(data))
            .catch(() => {
              this.buffers.delete(source)
              return null
            })
        : Promise.resolve(null)
      this.buffers.set(source, pending)
    }
    return pending
  }

  private async startMusic(): Promise<void> {
    const context = this.context
    const gain = this.musicGain
    if (!context || !gain) return
    const token = ++this.musicToken
    const track = musicTracks[this.trackIndex]
    // A placeholder keeps sync() from starting a second track meanwhile.
    this.music = context.createBufferSource()
    const buffer = await this.load(track)
    if (token !== this.musicToken) return
    if (!buffer) {
      this.music = null
      return
    }
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(gain)
    source.onended = () => {
      if (token !== this.musicToken) return
      source.disconnect()
      this.music = null
      // Only the playing and the next track stay decoded.
      this.buffers.delete(track)
      this.trackIndex = (this.trackIndex + 1) % musicTracks.length
      if (this.settings.musicEnabled) void this.startMusic()
    }
    this.music = source
    source.start()
    void this.load(musicTracks[(this.trackIndex + 1) % musicTracks.length])
  }

  private stopMusic(): void {
    this.musicToken += 1
    const source = this.music
    this.music = null
    if (!source) return
    source.onended = null
    try {
      source.stop()
    } catch {
      /* The placeholder never started. */
    }
    source.disconnect()
  }

  playEffect(name: EffectName): void {
    const context = this.context
    const gain = this.effectsGain
    if (!context || !gain || !this.settings.effectsEnabled || !this.audible) return
    const [source, volume] = effects[name]
    void this.load(source).then((buffer) => {
      if (!buffer || !this.audible || context.state === 'closed') return
      const node = context.createBufferSource()
      node.buffer = buffer
      const level = context.createGain()
      level.gain.value = volume
      node.connect(level).connect(gain)
      node.onended = () => level.disconnect()
      node.start()
    })
  }
}

export const gameAudio = new WebGameAudio()

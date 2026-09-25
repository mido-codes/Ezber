import type { AyahRow, ReciterRow } from '../content/types'
import type { DrillAudioResolver, ResolvedAudio } from './audio'
import type { DrillItem } from './queue'

export type DrillStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'completed'

export interface DrillEngineState {
  status: DrillStatus
  pass: number
  index: number
  globalIndex: number
  item: DrillItem | null
  positionMs: number
  durationMs: number
  activeWord: number
  completedRepetitions: number
  totalRepetitions: number
  sectionRepeats: number
  usingPlaceholderAudio: boolean
  isGap: boolean
  error: string | null
}

export interface DrillStartPoint {
  pass?: number
  index?: number
  positionMs?: number
}

export interface DrillEngineStats {
  repetitions: number
  verses: number
  passes: number
}

export interface DrillEngineCallbacks {
  onState: (state: DrillEngineState) => void
  onItemComplete?: (item: DrillItem, globalIndex: number) => void
  onVerseComplete?: (ayah: AyahRow, pass: number) => void
  onSectionPassComplete?: (pass: number) => void
  onCompleted?: (stats: DrillEngineStats) => void
  onVerseEntered?: (item: DrillItem, reason: 'auto' | 'manual' | 'resume') => void
  onAudioSource?: (source: 'bundle' | 'placeholder') => void
}

export interface DrillEngineOptions {
  queue: DrillItem[]
  resolver: DrillAudioResolver
  reciter: ReciterRow
  variant?: string
  sectionRepeats: number
  pauseBetweenRepeatsMs: number
  start?: DrillStartPoint
  nowPlaying: {
    presetName: string
    surahName: string
    reciterName: string
  }
  callbacks: DrillEngineCallbacks
}

function clampPositionMs(value: number, max = Number.MAX_SAFE_INTEGER): number {
  return Math.min(Math.max(0, Math.round(value)), max)
}

export class DrillEngine {
  private readonly queue: DrillItem[]
  private readonly resolver: DrillAudioResolver
  private readonly reciter: ReciterRow
  private readonly variant: string
  private readonly sectionRepeats: number
  private readonly pauseBetweenRepeatsMs: number
  private readonly callbacks: DrillEngineCallbacks
  private readonly nowPlaying: DrillEngineOptions['nowPlaying']

  private audio: HTMLAudioElement | null = null
  private resolved: ResolvedAudio | null = null
  private pass: number
  private index: number
  private status: DrillStatus = 'idle'
  private positionMs = 0
  private durationMs = 0
  private activeWord = 0
  private isGap = false
  private completedRepetitions = 0
  private completedVerses = new Set<string>()
  private error: string | null = null
  private usingPlaceholderAudio = false
  private gapTimer: ReturnType<typeof setTimeout> | null = null
  private loadToken = 0
  private disposed = false
  private lastEmit = 0

  constructor(options: DrillEngineOptions) {
    this.queue = options.queue
    this.resolver = options.resolver
    this.reciter = options.reciter
    this.variant = options.variant ?? 'default'
    this.sectionRepeats = options.sectionRepeats
    this.pauseBetweenRepeatsMs = options.pauseBetweenRepeatsMs
    this.callbacks = options.callbacks
    this.nowPlaying = options.nowPlaying
    this.pass = Math.max(1, options.start?.pass ?? 1)
    this.index = Math.min(Math.max(0, options.start?.index ?? 0), Math.max(0, this.queue.length - 1))
    this.positionMs = clampPositionMs(options.start?.positionMs ?? 0)
  }

  get state(): DrillEngineState {
    return this.snapshot()
  }

  private snapshot(): DrillEngineState {
    return {
      status: this.status,
      pass: this.pass,
      index: this.index,
      globalIndex: (this.pass - 1) * this.queue.length + this.index,
      item: this.queue[this.index] ?? null,
      positionMs: this.positionMs,
      durationMs: this.durationMs,
      activeWord: this.activeWord,
      completedRepetitions: this.completedRepetitions,
      totalRepetitions: this.sectionRepeats === 0 ? 0 : this.queue.length * this.sectionRepeats,
      sectionRepeats: this.sectionRepeats,
      usingPlaceholderAudio: this.usingPlaceholderAudio,
      isGap: this.isGap,
      error: this.error,
    }
  }

  private emit(force = false): void {
    const now = Date.now()
    if (!force && now - this.lastEmit < 120) return
    this.lastEmit = now
    this.callbacks.onState(this.snapshot())
  }

  // ---------------------------------------------------------------- lifecycle

  async prepare(autoPlay = false): Promise<void> {
    if (typeof window === 'undefined' || this.queue.length === 0) return
    if (!this.audio) {
      this.audio = new Audio()
      this.audio.preload = 'auto'
      this.audio.addEventListener('ended', () => void this.handleEnded())
      this.audio.addEventListener('timeupdate', () => this.handleTimeUpdate())
      this.audio.addEventListener('pause', () => {
        if (this.status === 'playing' && !this.isGap) {
          this.status = 'paused'
          this.syncMediaSession()
          this.emit(true)
        }
      })
      this.audio.addEventListener('play', () => {
        this.status = 'playing'
        this.syncMediaSession()
        this.emit(true)
      })
    }
    this.callbacks.onVerseEntered?.(this.queue[this.index], 'resume')
    await this.loadCurrent(autoPlay)
  }

  private currentItem(): DrillItem | null {
    return this.queue[this.index] ?? null
  }

  private async loadCurrent(autoPlay: boolean, resumePositionMs = 0): Promise<void> {
    const item = this.currentItem()
    if (!item || !this.audio) return
    const token = ++this.loadToken
    this.status = 'loading'
    this.isGap = false
    this.activeWord = 0
    this.emit(true)
    try {
      const resolved = await this.resolver.resolve(this.reciter, item.ayah, this.variant)
      if (token !== this.loadToken || this.disposed) return
      this.resolved = resolved
      this.usingPlaceholderAudio = resolved.source === 'placeholder'
      this.callbacks.onAudioSource?.(resolved.source)
      this.durationMs = resolved.durationMs
      this.audio.src = resolved.url
      this.audio.currentTime = Math.min(resumePositionMs / 1000, resolved.durationMs / 1000)
      this.positionMs = clampPositionMs(resumePositionMs, resolved.durationMs)
      this.updateMediaMetadata()
      if (autoPlay) {
        await this.audio.play()
      } else {
        this.status = 'paused'
        this.emit(true)
      }
    } catch (error) {
      if (token !== this.loadToken || this.disposed) return
      this.error = error instanceof Error ? error.message : String(error)
      this.status = 'paused'
      this.emit(true)
    }
  }

  async play(): Promise<void> {
    if (this.status === 'completed') {
      this.restart()
    }
    if (!this.audio) {
      await this.prepare(true)
      return
    }
    try {
      await this.audio.play()
      this.status = 'playing'
      this.error = null
    } catch (error) {
      this.status = 'paused'
      this.error = error instanceof Error ? error.message : String(error)
    }
    this.syncMediaSession()
    this.emit(true)
  }

  pause(): void {
    this.clearGap()
    this.audio?.pause()
    if (this.status !== 'completed') this.status = 'paused'
    this.syncMediaSession()
    this.emit(true)
  }

  async toggle(): Promise<void> {
    if (this.status === 'playing') this.pause()
    else await this.play()
  }

  restart(): void {
    this.completedRepetitions = 0
    this.completedVerses.clear()
    this.pass = 1
    this.index = 0
    this.positionMs = 0
    void this.loadCurrent(true)
  }

  stop(): void {
    this.disposed = true
    this.clearGap()
    this.audio?.pause()
    if (this.audio) this.audio.src = ''
    this.status = 'idle'
    this.clearMediaSession()
    this.emit(true)
  }

  // ------------------------------------------------------------------ advance

  private clearGap(): void {
    if (this.gapTimer) {
      clearTimeout(this.gapTimer)
      this.gapTimer = null
    }
    this.isGap = false
  }

  private afterGap(action: () => void): void {
    if (this.pauseBetweenRepeatsMs <= 0) {
      action()
      return
    }
    this.isGap = true
    this.audio?.pause()
    this.emit(true)
    this.gapTimer = setTimeout(() => {
      this.gapTimer = null
      this.isGap = false
      action()
    }, this.pauseBetweenRepeatsMs)
  }

  private async handleEnded(): Promise<void> {
    const item = this.currentItem()
    if (!item) return
    this.callbacks.onItemComplete?.(item, (this.pass - 1) * this.queue.length + this.index)
    this.completedRepetitions += 1
    this.completedVerses.add(item.ayah.verse_key)
    const isLastItemOfVerse =
      this.index + 1 >= this.queue.length ||
      this.queue[this.index + 1].ayah.verse_key !== item.ayah.verse_key
    if (isLastItemOfVerse) {
      this.callbacks.onVerseComplete?.(item.ayah, this.pass)
    }
    if (this.index + 1 < this.queue.length) {
      this.index += 1
      const next = this.currentItem()
      if (next) this.callbacks.onVerseEntered?.(next, 'auto')
      this.afterGap(() => void this.loadCurrent(true))
      return
    }
    // End of a full pass through the section.
    this.callbacks.onSectionPassComplete?.(this.pass)
    if (this.sectionRepeats === 0 || this.pass < this.sectionRepeats) {
      this.pass += 1
      this.index = 0
      const next = this.currentItem()
      if (next) this.callbacks.onVerseEntered?.(next, 'auto')
      this.afterGap(() => void this.loadCurrent(true))
      return
    }
    this.status = 'completed'
    this.syncMediaSession()
    this.emit(true)
    this.callbacks.onCompleted?.({
      repetitions: this.completedRepetitions,
      verses: this.completedVerses.size,
      passes: this.sectionRepeats === 0 ? this.pass : this.sectionRepeats,
    })
  }

  nextRepeat(): void {
    this.clearGap()
    if (this.index + 1 < this.queue.length) {
      this.index += 1
    } else if (this.sectionRepeats === 0 || this.pass < this.sectionRepeats) {
      this.pass += 1
      this.index = 0
    } else {
      this.status = 'completed'
      this.emit(true)
      return
    }
    const next = this.currentItem()
    if (next) this.callbacks.onVerseEntered?.(next, 'manual')
    void this.loadCurrent(true)
  }

  previousRepeat(): void {
    this.clearGap()
    if (this.audio && this.positionMs > 3000) {
      this.seekTo(0)
      return
    }
    if (this.index > 0) this.index -= 1
    else if (this.pass > 1) {
      this.pass -= 1
      this.index = Math.max(0, this.queue.length - 1)
    } else {
      this.seekTo(0)
      return
    }
    const previous = this.currentItem()
    if (previous) this.callbacks.onVerseEntered?.(previous, 'manual')
    void this.loadCurrent(true)
  }

  nextVerse(): void {
    this.clearGap()
    const current = this.currentItem()
    if (!current) return
    const nextIndex = this.queue.findIndex((item, itemIndex) => {
      return itemIndex > this.index && item.ayah.ayah > current.ayah.ayah
    })
    if (nextIndex >= 0) {
      this.index = nextIndex
    } else if (this.sectionRepeats === 0 || this.pass < this.sectionRepeats) {
      this.pass += 1
      this.index = 0
    } else {
      this.status = 'completed'
      this.emit(true)
      return
    }
    const next = this.currentItem()
    if (next) this.callbacks.onVerseEntered?.(next, 'manual')
    void this.loadCurrent(true)
  }

  previousVerse(): void {
    this.clearGap()
    const current = this.currentItem()
    if (!current) return
    let target = -1
    for (let itemIndex = this.index - 1; itemIndex >= 0; itemIndex -= 1) {
      if (this.queue[itemIndex].ayah.ayah < current.ayah.ayah) {
        target = itemIndex
        break
      }
    }
    if (target >= 0) {
      // Jump to the first repeat of that verse, not its last one.
      const ayahNumber = this.queue[target].ayah.ayah
      while (target > 0 && this.queue[target - 1].ayah.ayah === ayahNumber) target -= 1
    } else {
      target = this.queue.findIndex((item) => item.ayah.verse_key === current.ayah.verse_key)
    }
    this.index = Math.max(0, target)
    void this.loadCurrent(true)
  }

  seekTo(positionMs: number): void {
    if (!this.audio) return
    const clamped = clampPositionMs(positionMs, this.durationMs || Number.MAX_SAFE_INTEGER)
    this.audio.currentTime = clamped / 1000
    this.positionMs = clamped
    this.syncPositionState()
    this.emit(true)
  }

  seekBy(seconds: number): void {
    this.seekTo(this.positionMs + seconds * 1000)
  }

  // ------------------------------------------------------------------ service

  private handleTimeUpdate(): void {
    if (!this.audio) return
    this.positionMs = clampPositionMs(this.audio.currentTime * 1000, this.durationMs)
    this.updateActiveWord()
    this.syncPositionState()
    this.emit()
  }

  private updateActiveWord(): void {
    const item = this.currentItem()
    if (!item) return
    const wordCount = item.ayah.transliteration.split(/\s+/).filter(Boolean).length
    let nextWord = 0
    if (this.resolved && this.resolved.segments.length > 0) {
      const segment = this.resolved.segments.find(
        (entry) => this.positionMs >= entry.start_ms && this.positionMs < entry.end_ms,
      )
      nextWord = segment?.word_index ?? 0
    } else if (this.durationMs > 0) {
      const ratio = this.positionMs / this.durationMs
      nextWord = Math.min(wordCount, Math.max(1, Math.ceil(ratio * wordCount)))
      if (ratio >= 1) nextWord = wordCount
    }
    if (nextWord !== this.activeWord) {
      this.activeWord = nextWord
      this.emit(true)
    }
  }

  // -------------------------------------------------------------- media session

  private updateMediaMetadata(): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    const item = this.currentItem()
    if (!item) return
    const MediaMetadataCtor = window.MediaMetadata
    if (MediaMetadataCtor) {
      navigator.mediaSession.metadata = new MediaMetadataCtor({
        title: `${item.ayah.verse_key} · ${this.nowPlaying.presetName}`,
        artist: this.nowPlaying.reciterName,
        album: this.nowPlaying.surahName,
        artwork: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      })
    }
    navigator.mediaSession.setActionHandler('play', () => void this.play())
    navigator.mediaSession.setActionHandler('pause', () => this.pause())
    navigator.mediaSession.setActionHandler('nexttrack', () => this.nextVerse())
    navigator.mediaSession.setActionHandler('previoustrack', () => this.previousVerse())
    navigator.mediaSession.setActionHandler('seekforward', () => this.seekBy(15))
    navigator.mediaSession.setActionHandler('seekbackward', () => this.seekBy(-15))
    navigator.mediaSession.setActionHandler('stop', () => this.pause())
  }

  private syncPositionState(): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    if (this.durationMs <= 0) return
    try {
      navigator.mediaSession.setPositionState({
        duration: this.durationMs / 1000,
        playbackRate: this.audio?.playbackRate ?? 1,
        position: Math.min(this.durationMs / 1000, this.positionMs / 1000),
      })
    } catch {
      // setPositionState throws when values are momentarily inconsistent.
    }
  }

  private syncMediaSession(): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState =
      this.status === 'playing' ? 'playing' : this.status === 'paused' ? 'paused' : 'none'
  }

  private clearMediaSession(): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    navigator.mediaSession.metadata = null
    for (const action of [
      'play',
      'pause',
      'nexttrack',
      'previoustrack',
      'seekforward',
      'seekbackward',
      'stop',
    ] as const) {
      try {
        navigator.mediaSession.setActionHandler(action, null)
      } catch {
        // Some browsers reject unsupported actions; ignore.
      }
    }
  }
}

'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ContentRepository } from '../content/repository'
import type { ContentSummary } from '../content/types'
import { translate, type Language, type TranslationKey } from '../i18n'
import { UserRepository } from '../user/repository'

export type ThemeSetting = 'system' | 'light' | 'dark'

interface AppContextValue {
  ready: boolean
  error: string | null
  startupMessage: string
  content: ContentRepository | null
  user: UserRepository | null
  summary: ContentSummary | null
  settings: Record<string, string>
  language: Language
  theme: ThemeSetting
  revision: number
  refresh: () => void
  setSetting: (key: string, value: string) => Promise<void>
  setSettings: (patch: Record<string, string>) => Promise<void>
  setLanguage: (language: Language) => Promise<void>
  setTheme: (theme: ThemeSetting) => Promise<void>
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
  setting: (key: string, fallback?: string) => string
}

const AppContext = createContext<AppContextValue | null>(null)

export function useApp(): AppContextValue {
  const value = useContext(AppContext)
  if (!value) throw new Error('useApp must be used inside <AppProvider>')
  return value
}

function applyTheme(theme: ThemeSetting): void {
  if (typeof document === 'undefined') return
  const prefersDark =
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = theme === 'dark' || (theme === 'system' && prefersDark)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [startupMessage, setStartupMessage] = useState('Opening local content…')
  const [content, setContent] = useState<ContentRepository | null>(null)
  const [user, setUser] = useState<UserRepository | null>(null)
  const [summary, setSummary] = useState<ContentSummary | null>(null)
  const [settings, setSettingsState] = useState<Record<string, string>>({})
  const [revision, setRevision] = useState(0)
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    let cancelled = false

    async function boot() {
      try {
        const contentRepository = await ContentRepository.open({
          onImport: (message) => {
            if (!cancelled) setStartupMessage(message)
          },
        })
        if (cancelled) return
        setStartupMessage('Opening your presets and notes…')
        const userRepository = await UserRepository.open()
        if (cancelled) return

        const seeded = await userRepository.hasSeededPlaceholderData()
        if (!seeded) {
          const reciters = await contentRepository.reciters()
          await userRepository.seedDemoData(reciters[0]?.id ?? 1)
        }
        const freshSettings = await userRepository.allSettings()

        if (cancelled) return
        setContent(contentRepository)
        setUser(userRepository)
        setSummary(contentRepository.summary())
        setSettingsState(freshSettings)
        setReady(true)
      } catch (bootError) {
        if (!cancelled) {
          setError(bootError instanceof Error ? bootError.message : String(bootError))
        }
      }
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [])

  const theme = (settings.theme as ThemeSetting) ?? 'system'
  const language = (settings.language as Language) ?? 'en'

  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system' || typeof window === 'undefined') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = () => applyTheme('system')
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [theme])

  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = language
  }, [language])

  const refresh = useCallback(() => setRevision((value) => value + 1), [])

  const setSetting = useCallback(
    async (key: string, value: string) => {
      if (!user) return
      await user.setSetting(key, value)
      const next = await user.allSettings()
      setSettingsState(next)
      refresh()
    },
    [user, refresh],
  )

  const setSettings = useCallback(
    async (patch: Record<string, string>) => {
      if (!user) return
      for (const [key, value] of Object.entries(patch)) {
        await user.setSetting(key, value)
      }
      const next = await user.allSettings()
      setSettingsState(next)
      refresh()
    },
    [user, refresh],
  )

  const setLanguage = useCallback(
    async (nextLanguage: Language) => {
      await setSetting('language', nextLanguage)
    },
    [setSetting],
  )

  const setTheme = useCallback(
    async (nextTheme: ThemeSetting) => {
      await setSetting('theme', nextTheme)
    },
    [setSetting],
  )

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) =>
      translate(language, key, params),
    [language],
  )

  const setting = useCallback(
    (key: string, fallback = '') => settings[key] ?? fallback,
    [settings],
  )

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      error,
      startupMessage,
      content,
      user,
      summary,
      settings,
      language,
      theme,
      revision,
      refresh,
      setSetting,
      setSettings,
      setLanguage,
      setTheme,
      t,
      setting,
    }),
    [
      ready,
      error,
      startupMessage,
      content,
      user,
      summary,
      settings,
      language,
      theme,
      revision,
      refresh,
      setSetting,
      setSettings,
      setLanguage,
      setTheme,
      t,
      setting,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

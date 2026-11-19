import React from 'react'
import { Moon, Sun } from 'lucide-react'
import { LANGUAGES, usePreferences } from '../context/PreferencesContext'

export default function AppPreferences() {
  const { theme, setTheme, language, setLanguage, t } = usePreferences()
  const dark = theme === 'dark'

  return (
    <aside className="app-preferences" aria-label={t('Appearance and language')}>
      <label className="app-preferences-language">
        <span className="sr-only">{t('Language')}</span>
        <select
          value={language}
          onChange={(event) => setLanguage(event.target.value)}
          aria-label={t('Language')}
          title={t('Language')}
        >
          {LANGUAGES.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
        </select>
      </label>
      <button
        type="button"
        className="app-preferences-theme"
        onClick={() => setTheme(dark ? 'light' : 'dark')}
        aria-label={t(dark ? 'Light mode' : 'Dark mode')}
        aria-pressed={dark}
        title={t(dark ? 'Light mode' : 'Dark mode')}
      >
        {dark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
        <span>{t(dark ? 'Light mode' : 'Dark mode')}</span>
      </button>
    </aside>
  )
}

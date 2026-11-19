import React from 'react'
import { OwnerProvider } from './context/OwnerContext'
import { PreferencesProvider } from './context/PreferencesContext'
import AppRoutes from './routes/AppRoutes'
import AppPreferences from './components/AppPreferences'

export default function App() {
  return (
    <PreferencesProvider>
      <OwnerProvider>
        <AppRoutes />
      </OwnerProvider>
      <AppPreferences />
    </PreferencesProvider>
  )
}

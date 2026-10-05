import React from 'react'
import { OwnerProvider } from './context/OwnerContext'
import { NotificationProvider } from './context/NotificationContext'
import AppRoutes from './routes/AppRoutes'

export default function App() {
  return (
    <OwnerProvider>
      <NotificationProvider>
        <AppRoutes />
      </NotificationProvider>
    </OwnerProvider>
  )
}

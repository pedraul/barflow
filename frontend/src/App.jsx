import React from 'react'
import { OwnerProvider } from './context/OwnerContext'
import AppRoutes from './routes/AppRoutes'

export default function App() {
  return (
    <OwnerProvider>
      <AppRoutes />
    </OwnerProvider>
  )
}

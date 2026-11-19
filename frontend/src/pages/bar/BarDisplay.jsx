import { usePreferences } from '../../context/PreferencesContext'
import React from 'react'
import StationDisplay from '../../components/StationDisplay'
import * as api from '../../api/endpoints'

export default function BarDisplay() {
  const { t } = usePreferences()
  return (
    <StationDisplay
      title={t("🍺 Bar Display")}
      accent="#17a2b8"
      stationLabel="Bar"
      fetchOrders={api.fetchBarOrders}
      newHeading="🆕 New Drink Orders"
      preparingHeading="🍸 Preparing"
      readyHeading="✅ Ready for Serving"
      paidHeading="💳 Paid — Waiting for Delivery"
      newAlert="🍺 New Drink Order Received!"
      startLabel="▶ Start Mixing"
      readyLabel="✓ Mark as Ready"
      showImage={true}
    />
  )
}

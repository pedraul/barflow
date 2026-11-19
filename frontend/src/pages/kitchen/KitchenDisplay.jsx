import { usePreferences } from '../../context/PreferencesContext'
import React from 'react'
import StationDisplay from '../../components/StationDisplay'
import * as api from '../../api/endpoints'

export default function KitchenDisplay() {
  const { t } = usePreferences()
  return (
    <StationDisplay
      title={t("👨‍🍳 Kitchen Display")}
      accent="#fd7e14"
      stationLabel="Kitchen"
      fetchOrders={api.fetchKitchenOrders}
      newHeading="🆕 New Orders"
      preparingHeading="👨‍🍳 In Progress"
      readyHeading="✅ Ready for Serving"
      paidHeading="💳 Paid — Waiting for Delivery"
      newAlert="🔔 New Food Order Received!"
      startLabel="▶ Start Preparing"
      readyLabel="✓ Mark as Ready"
      showImage={false}
    />
  )
}

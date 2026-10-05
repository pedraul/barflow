import React from 'react'
import { createContext, useContext, useState, useEffect } from 'react'
import * as api from '../api/endpoints'
import { useAuth } from './AuthContext'

const SalaryContext = createContext(null)

export function SalaryProvider({ children }) {
  const { user } = useAuth()
  const [salaryPayments, setSalaryPayments] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user) return
    let active = true
    api.fetchSalaryPayments()
      .then((data) => { if (active) { setSalaryPayments(data); setError(null) } })
      .catch((err) => { if (active) { setError(err.message); setSalaryPayments([]) } })
      .finally(() => { if (active) setLoaded(true) })
    return () => { active = false }
  }, [user])

  const recordSalaryPayment = async (payment) => {
    const created = await api.createSalaryPayment(payment)
    const full = { ...payment, id: created.id, status: created.status || 'pending' }
    setSalaryPayments((current) => [full, ...current])
    return full
  }

  return (
    <SalaryContext.Provider value={{ salaryPayments, recordSalaryPayment, loaded, error }}>
      {children}
    </SalaryContext.Provider>
  )
}

export function useSalary() {
  const context = useContext(SalaryContext)
  if (!context) throw new Error('useSalary must be used within SalaryProvider')
  return context
}

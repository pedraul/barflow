import React, { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { usePreferences } from '../context/PreferencesContext'

export default function NotFoundPage() {
  const { t } = usePreferences()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const pathname = location.pathname.replace(/\/+$/, '')
    if (pathname !== '/menu' && pathname.endsWith('/menu')) {
      navigate(`/menu${location.search}`, { replace: true })
    }
  }, [location.pathname, location.search, navigate])

  const normalizedPath = location.pathname.replace(/\/+$/, '')
  if (normalizedPath !== '/menu' && normalizedPath.endsWith('/menu')) return null

  return (
    <div className="page page-center">
      <div className="card">
        <h1>{t('Page not found')}</h1>
        <p>{t('The page you are looking for does not exist.')}</p>
        <Link to="/login">{t('Back to login')}</Link>
      </div>
    </div>
  )
}

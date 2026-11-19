import React from 'react'
import { usePreferences } from '../context/PreferencesContext'

class ErrorBoundaryView extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // you can log to an external service here
    // console.error('ErrorBoundary caught:', error, info)
  }

  reset = () => this.setState({ hasError: false, error: null })

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24 }}>
          <h2>{this.props.t('Something went wrong.')}</h2>
          <p>{this.state.error?.message || this.props.t('An unexpected error occurred.')}</p>
          <div style={{ marginTop: 12 }}>
            <button onClick={this.reset} style={{ marginRight: 8 }}>{this.props.t('Try again')}</button>
            <button onClick={() => window.location.reload()}>{this.props.t('Reload app')}</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function ErrorBoundary(props) {
  const { t } = usePreferences()
  return <ErrorBoundaryView {...props} t={t} />
}

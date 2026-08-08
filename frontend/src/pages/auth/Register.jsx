import React from 'react'
import { Link } from 'react-router-dom'

export default function Register() {
  return (
    <div className="page page-center">
      <div className="card auth-card">
        <div className="auth-brand">Bar<span>Solution</span></div>
        <h1>Create account</h1>
        <p className="auth-subtitle">Account registration is managed by the Owner from the user management workspace.</p>
        <Link to="/login" className="pay-action">Back to login</Link>
      </div>
    </div>
  )
}

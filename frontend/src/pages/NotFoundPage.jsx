import React from 'react'
import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="page page-center">
      <div className="card">
        <h1>Page not found</h1>
        <p>The page you are looking for does not exist.</p>
        <Link to="/login">Back to login</Link>
      </div>
    </div>
  )
}

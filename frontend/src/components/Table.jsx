import React from 'react'
import { usePreferences } from '../context/PreferencesContext'

export default function Table({ columns, rows, rowKey = (row, i) => i }) {
  const { t } = usePreferences()
  return (
    <div className="user-table-wrap">
      <table className="user-table">
        <thead>
          <tr>{columns.map((column) => <th key={column.key}>{t(column.label)}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)}>
              {columns.map((column) => (
                <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

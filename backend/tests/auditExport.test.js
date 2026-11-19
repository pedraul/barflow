import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAuditVisibilityClause, serializeAuditLogs } from '../utils/audit.js'

test('audit visibility filters by the audit table actor_id column', () => {
  const visibility = buildAuditVisibilityClause({
    role: 'waiter',
    businessId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    userId: '11111111-2222-4333-8444-555555555555',
  })

  assert.match(visibility.where, /al\.actor_id = \$2/)
  assert.deepEqual(visibility.params, [
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    '11111111-2222-4333-8444-555555555555',
  ])
})

test('serializeAuditLogs returns JSON payloads for json exports', () => {
  const rows = [
    {
      created_at: '2024-01-02T03:04:05.000Z',
      actor_id: '11111111-2222-4333-8444-555555555555',
      actor_name: 'Owner',
      action: 'User login',
      target_module: 'Authentication',
      ip_address: '127.0.0.1',
      business_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      metadata: { source: 'web' },
    },
  ]

  const result = serializeAuditLogs(rows, 'json')
  assert.match(result, /"action": "User login"/)
  assert.match(result, /"source": "web"/)
})

test('serializeAuditLogs returns CSV for csv exports', () => {
  const rows = [
    {
      created_at: '2024-01-02T03:04:05.000Z',
      actor_id: '11111111-2222-4333-8444-555555555555',
      actor_name: 'Owner',
      action: 'User login',
      target_module: 'Authentication',
      ip_address: '127.0.0.1',
      business_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      metadata: { source: 'web' },
    },
  ]

  const result = serializeAuditLogs(rows, 'csv')
  assert.match(result, /Timestamp,User ID,Actor,Action,Target Module,IP Address,Business ID,Metadata/)
  assert.match(result, /User login/)
})

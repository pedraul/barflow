import test from 'node:test'
import assert from 'node:assert/strict'
import { generateQRCodeData, generateQRDisplay } from '../services/qrService.js'
import { mapOrder } from '../routes/helpers.js'

test('table ordering QR data identifies the business, branch, and table on the public menu route', () => {
  const previousFrontendUrl = process.env.FRONTEND_URL
  process.env.FRONTEND_URL = 'https://barflow.example'
  try {
    const qr = generateQRCodeData(12, 'Downtown Branch', 'business-123', 'branch-456', 'downtown-bar')
    const url = new URL(qr.url)
    assert.equal(qr.type, 'table_order')
    assert.equal(qr.table, 12)
    assert.equal(url.pathname, '/menu')
    assert.equal(url.searchParams.get('table'), '12')
    assert.equal(url.searchParams.get('businessId'), 'business-123')
    assert.equal(url.searchParams.get('branchId'), 'branch-456')

    const printable = generateQRDisplay(12, 'Downtown Branch', 'business-123')
    assert.equal(printable.qrText, 'Table 12')
    assert.equal(printable.printable, true)
  } finally {
    if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL
    else process.env.FRONTEND_URL = previousFrontendUrl
  }
})

test('table ordering QR removes a workspace slug from FRONTEND_URL', () => {
  const previousFrontendUrl = process.env.FRONTEND_URL
  process.env.FRONTEND_URL = 'https://barflow.example/fina-bar/'
  try {
    const qr = generateQRCodeData(1, 'Main Branch', 'business-123', 'branch-456', 'fina-bar')
    const url = new URL(qr.url)
    assert.equal(url.pathname, '/menu')
  } finally {
    if (previousFrontendUrl === undefined) delete process.env.FRONTEND_URL
    else process.env.FRONTEND_URL = previousFrontendUrl
  }
})

test('order responses expose the table number, including older numeric table names', () => {
  const order = {
    id: 'order-1',
    order_number: '001',
    table_number: null,
    table_name: '12',
    total_amount: 2500,
    status: 'Open',
    created_at: new Date('2026-10-26T00:00:00Z'),
    items: [],
  }

  const mapped = mapOrder(order)
  assert.equal(mapped.tableNumber, 12)
  assert.equal(mapped.tableName, 'Table 12')
})

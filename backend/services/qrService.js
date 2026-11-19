/**
 * QR Code Service
 * Generates QR code data for table ordering
 * In production, this would integrate with a QR code library like qrcode
 * Here we generate the data that would be encoded in the QR
 */

/**
 * Generate QR code data for a specific table
 * @param {number} tableNumber - The table number
 * @param {string} branchName - The branch name
 * @returns {object} QR data object
 */
export function generateQRCodeData(tableNumber, branchName, businessId, branchId, businessSlug) {
  const params = new URLSearchParams()
  params.set('table', String(tableNumber))
  params.set('branch', branchName)
  if (businessId) params.set('businessId', businessId)
  if (branchId) params.set('branchId', branchId)
  const baseUrl = new URL(getBaseUrl())
  const normalizedSlug = String(businessSlug || '').toLowerCase().replace(/^\/+|\/+$/g, '')
  const baseSegments = baseUrl.pathname.split('/').filter(Boolean)
  if (normalizedSlug && baseSegments[baseSegments.length - 1]?.toLowerCase() === normalizedSlug) {
    baseSegments.pop()
  }
  const basePath = baseSegments.length ? `/${baseSegments.join('/')}` : ''

  return {
    type: 'table_order',
    table: tableNumber,
    branch: branchName,
    url: `${baseUrl.origin}${basePath}/menu?${params.toString()}`,
    version: '1.0',
  }
}

/**
 * Generate a QR code display object for printing
 * @param {number} tableNumber 
 * @param {string} branchName 
 * @returns {object} Display-ready QR info
 */
export function generateQRDisplay(tableNumber, branchName, businessId) {
  const data = generateQRCodeData(tableNumber, branchName, businessId)

  return {
    ...data,
    qrText: `Table ${tableNumber}`,
    instructions: `Scan to view menu and order`,
    printable: true,
  }
}

/**
 * Get the base URL for QR code generation
 */
function getBaseUrl() {
  return (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '')
}

export default {
  generateQRCodeData,
  generateQRDisplay,
}

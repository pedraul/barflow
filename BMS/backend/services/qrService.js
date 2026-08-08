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
export function generateQRCodeData(tableNumber, branchName, businessId) {
  const baseUrl = getBaseUrl()
  const params = new URLSearchParams()
  params.set('table', tableNumber)
  params.set('branch', branchName)
  if (businessId) params.set('businessId', businessId)

  return {
    type: 'table_order',
    table: tableNumber,
    branch: branchName,
    url: `${baseUrl}/menu?${params.toString()}`,
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
  // Use environment variable if set, otherwise default to localhost
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
  return frontendUrl
}

export default {
  generateQRCodeData,
  generateQRDisplay,
}
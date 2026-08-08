import dotenv from 'dotenv'
dotenv.config()

const MOMO = {
  baseUrl: process.env.MOMO_BASE_URL || 'https://sandbox.momopayment.example',
  apiKey: process.env.MOMO_API_KEY || process.env.MOMO_KEY || '',
  apiSecret: process.env.MOMO_API_SECRET || process.env.MOMO_SECRET || '',
  partnerId: process.env.MOMO_PARTNER_ID || '',
  callbackUrl: process.env.MOMO_CALLBACK_URL || (process.env.APP_URL ? `${process.env.APP_URL}/api/payments/momo/callback` : '/api/payments/momo/callback'),
  timeout: Number(process.env.MOMO_TIMEOUT_MS || 15000),
}

export default MOMO

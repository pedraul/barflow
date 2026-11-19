import dotenv from 'dotenv'
dotenv.config()

const MOMO = {
  baseUrl: process.env.MTN_MOMO_BASE_URL || 'https://sandbox.momodeveloper.mtn.com',
  targetEnvironment: process.env.MTN_MOMO_TARGET_ENVIRONMENT || 'sandbox',
  subscriptionKey: process.env.MTN_MOMO_SUBSCRIPTION_KEY || '',
  apiUser: process.env.MTN_MOMO_API_USER || '',
  apiKey: process.env.MTN_MOMO_API_KEY || '',
  timeout: Number(process.env.MOMO_TIMEOUT_MS || 15000),
}

export default MOMO

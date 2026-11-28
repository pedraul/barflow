import { randomUUID } from 'node:crypto'

const tokenCache = new Map()
const REQUEST_TIMEOUT_MS = Number(process.env.MOMO_TIMEOUT_MS || 15000)

function getProviderConfig(method) {
  if (method === 'mtn_momo') {
    const config = {
      baseUrl: process.env.MTN_MOMO_BASE_URL || 'https://sandbox.momodeveloper.mtn.com',
      targetEnvironment: process.env.MTN_MOMO_TARGET_ENVIRONMENT || 'sandbox',
      subscriptionKey: process.env.MTN_MOMO_SUBSCRIPTION_KEY,
      apiUser: process.env.MTN_MOMO_API_USER,
      apiKey: process.env.MTN_MOMO_API_KEY,
      callbackUrl: process.env.MTN_MOMO_CALLBACK_URL,
    }
    if (!config.subscriptionKey || !config.apiUser || !config.apiKey) {
      throw new Error('MTN MoMo is not configured. Set MTN_MOMO_SUBSCRIPTION_KEY, MTN_MOMO_API_USER and MTN_MOMO_API_KEY.')
    }
    return { ...config, provider: 'mtn_momo' }
  }

  if (method === 'airtel_money') {
    const config = {
      baseUrl: process.env.AIRTEL_MONEY_BASE_URL || 'https://openapiuat.airtel.africa',
      clientId: process.env.AIRTEL_MONEY_CLIENT_ID,
      clientSecret: process.env.AIRTEL_MONEY_CLIENT_SECRET,
      country: process.env.AIRTEL_MONEY_COUNTRY || 'RW',
      currency: process.env.AIRTEL_MONEY_CURRENCY || 'RWF',
    }
    if (!config.clientId || !config.clientSecret) {
      throw new Error('Airtel Money is not configured. Set AIRTEL_MONEY_CLIENT_ID and AIRTEL_MONEY_CLIENT_SECRET.')
    }
    return { ...config, provider: 'airtel_money' }
  }

  throw new Error(`Unsupported online payment method: ${method}`)
}

async function request(config, path, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}${path}`, {
      ...options,
      signal: controller.signal,
    })
    const text = await response.text()
    let data = null
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = null
      }
    }
    if (!response.ok) {
      const error = new Error(`${config.provider} request failed with HTTP ${response.status}.`)
      error.ambiguous = response.status >= 500
      throw error
    }
    return { data, response }
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error(`${config.provider} request timed out.`)
      timeoutError.ambiguous = true
      throw timeoutError
    }
    if (error.ambiguous === undefined) error.ambiguous = true
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

async function mtnToken(config) {
  const cacheKey = `${config.baseUrl}:${config.apiUser}`
  const cached = tokenCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.token

  const authorization = Buffer.from(`${config.apiUser}:${config.apiKey}`).toString('base64')
  const { data } = await request(config, '/collection/token/', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authorization}`,
      'Ocp-Apim-Subscription-Key': config.subscriptionKey,
      'X-Target-Environment': config.targetEnvironment,
    },
  })
  if (!data?.access_token) throw new Error('MTN MoMo did not return an access token.')
  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(Number(data.expires_in || 3600) - 60, 30) * 1000,
  })
  return data.access_token
}

function getPayoutConfig(method) {
  if (method === 'mtn_momo') {
    const config = {
      baseUrl: process.env.MTN_MOMO_DISBURSEMENT_BASE_URL || process.env.MTN_MOMO_BASE_URL || 'https://sandbox.momodeveloper.mtn.com',
      targetEnvironment: process.env.MTN_MOMO_TARGET_ENVIRONMENT || 'sandbox',
      subscriptionKey: process.env.MTN_MOMO_DISBURSEMENT_SUBSCRIPTION_KEY,
      apiUser: process.env.MTN_MOMO_DISBURSEMENT_API_USER,
      apiKey: process.env.MTN_MOMO_DISBURSEMENT_API_KEY,
    }
    if (!config.subscriptionKey || !config.apiUser || !config.apiKey) {
      throw new Error('MTN MoMo disbursements are not configured. Set MTN_MOMO_DISBURSEMENT_SUBSCRIPTION_KEY, MTN_MOMO_DISBURSEMENT_API_USER and MTN_MOMO_DISBURSEMENT_API_KEY.')
    }
    return { ...config, provider: 'mtn_momo' }
  }

  if (method === 'airtel_money') {
    const config = {
      baseUrl: process.env.AIRTEL_MONEY_BASE_URL || 'https://openapiuat.airtel.africa',
      clientId: process.env.AIRTEL_MONEY_CLIENT_ID,
      clientSecret: process.env.AIRTEL_MONEY_CLIENT_SECRET,
      country: process.env.AIRTEL_MONEY_COUNTRY || 'RW',
      currency: process.env.AIRTEL_MONEY_CURRENCY || 'RWF',
    }
    if (!config.clientId || !config.clientSecret) {
      throw new Error('Airtel Money disbursements are not configured. Set AIRTEL_MONEY_CLIENT_ID and AIRTEL_MONEY_CLIENT_SECRET and enable the disbursement product for your account.')
    }
    return { ...config, provider: 'airtel_money' }
  }

  throw new Error(`Unsupported payout method: ${method}`)
}

export function validateMobileMoneyPayoutConfig(method) {
  getPayoutConfig(method)
}

async function mtnDisbursementToken(config) {
  const cacheKey = `${config.baseUrl}:${config.apiUser}:disbursement`
  const cached = tokenCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.token

  const authorization = Buffer.from(`${config.apiUser}:${config.apiKey}`).toString('base64')
  const { data } = await request(config, '/disbursement/token/', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authorization}`,
      'Ocp-Apim-Subscription-Key': config.subscriptionKey,
      'X-Target-Environment': config.targetEnvironment,
    },
  })
  if (!data?.access_token) throw new Error('MTN MoMo disbursement API did not return an access token.')
  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(Number(data.expires_in || 3600) - 60, 30) * 1000,
  })
  return data.access_token
}

async function airtelToken(config) {
  const cacheKey = `${config.baseUrl}:${config.clientId}`
  const cached = tokenCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.token

  const { data } = await request(config, '/auth/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'client_credentials',
    }),
  })
  if (!data?.access_token) throw new Error('Airtel Money did not return an access token.')
  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(Number(data.expires_in || 3600) - 60, 30) * 1000,
  })
  return data.access_token
}

function providerHeaders(config, token) {
  if (config.provider === 'mtn_momo') {
    return {
      Authorization: `Bearer ${token}`,
      'Ocp-Apim-Subscription-Key': config.subscriptionKey,
      'X-Target-Environment': config.targetEnvironment,
      'Content-Type': 'application/json',
    }
  }
  return {
    Authorization: `Bearer ${token}`,
    'X-Country': config.country,
    'X-Currency': config.currency,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

export function normalizeRwandaPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  const international = digits.startsWith('0') ? `250${digits.slice(1)}` : digits
  if (!/^2507\d{8}$/.test(international)) {
    throw new Error('Enter a valid Rwanda mobile number, for example 0788123456.')
  }
  return international
}

function validateTransaction(payment, transaction, reference, expectedReference) {
  if (transaction?.amount == null || !transaction?.currency) {
    throw new Error('The provider response is missing the transaction amount or currency.')
  }
  if (Number(transaction.amount) !== Number(payment.amount)) {
    throw new Error('The provider transaction amount does not match the payment amount.')
  }
  if (String(transaction.currency).toUpperCase() !== 'RWF') {
    throw new Error('The provider transaction currency does not match RWF.')
  }
  if (!reference || reference !== expectedReference) {
    throw new Error('The provider transaction reference does not match this payment.')
  }
}

export async function requestMobileMoneyPayment({ method, reference, amount, phone }) {
  const config = getProviderConfig(method)
  const phoneNumber = normalizeRwandaPhone(phone)
  const token = method === 'mtn_momo' ? await mtnToken(config) : await airtelToken(config)
  const transactionId = randomUUID()
  const headers = providerHeaders(config, token)

  if (method === 'mtn_momo') {
    const callbackHeader = config.callbackUrl ? { 'X-Callback-Url': config.callbackUrl } : {}
    await request(config, '/collection/v1_0/requesttopay', {
      method: 'POST',
      headers: {
        ...headers,
        ...callbackHeader,
        'X-Reference-Id': reference,
      },
      body: JSON.stringify({
        amount: String(amount),
        currency: 'RWF',
        externalId: reference,
        payer: { partyIdType: 'MSISDN', partyId: phoneNumber },
        payerMessage: 'BarFlow payment',
        payeeNote: `Payment ${reference}`,
      }),
    })
    return { provider: config.provider, providerTxnId: reference, providerStatus: 'PENDING' }
  }

  const { data } = await request(config, '/merchant/v1/payments/', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      reference,
      subscriber: {
        country: config.country,
        currency: config.currency,
        msisdn: phoneNumber,
      },
      transaction: {
        amount: String(amount),
        country: config.country,
        currency: config.currency,
        id: transactionId,
      },
    }),
  })
  return {
    provider: config.provider,
    providerTxnId: data?.data?.transaction?.id || transactionId,
    providerStatus: 'PENDING',
  }
}

export async function requestMobileMoneyPayout({ method, reference, transactionId, amount, phone }) {
  const config = getPayoutConfig(method)
  const phoneNumber = normalizeRwandaPhone(phone)
  let token
  try {
    token = method === 'mtn_momo' ? await mtnDisbursementToken(config) : await airtelToken(config)
  } catch (error) {
    error.payoutRequestSent = false
    throw error
  }
  const headers = providerHeaders(config, token)

  if (method === 'mtn_momo') {
    try {
      await request(config, '/disbursement/v1_0/transfer', {
        method: 'POST',
        headers: {
          ...headers,
          'X-Reference-Id': reference,
        },
        body: JSON.stringify({
          amount: String(amount),
          currency: 'RWF',
          externalId: reference,
          payee: { partyIdType: 'MSISDN', partyId: phoneNumber },
          payerMessage: 'BarFlow business payout',
          payeeNote: `Business payout ${reference}`,
        }),
      })
    } catch (error) {
      error.payoutRequestSent = true
      throw error
    }
    return { provider: config.provider, providerTxnId: reference, providerStatus: 'PENDING' }
  }

  let data
  try {
    ({ data } = await request(config, '/standard/v1/disbursements/', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        reference,
        payee: { msisdn: phoneNumber },
        transaction: {
          amount: String(amount),
          country: config.country,
          currency: config.currency,
          id: transactionId,
        },
      }),
    }))
  } catch (error) {
    error.payoutRequestSent = true
    throw error
  }
  return {
    provider: config.provider,
    providerTxnId: data?.data?.transaction?.id || transactionId,
    providerStatus: String(data?.data?.transaction?.status || 'PENDING').toUpperCase(),
  }
}

export async function getMobileMoneyPayoutStatus(payout) {
  const config = getPayoutConfig(payout.method)
  const token = payout.method === 'mtn_momo'
    ? await mtnDisbursementToken(config)
    : await airtelToken(config)
  const headers = providerHeaders(config, token)

  if (payout.method === 'mtn_momo') {
    const { data } = await request(
      config,
      `/disbursement/v1_0/transfer/${encodeURIComponent(payout.provider_reference)}`,
      { headers }
    )
    const state = String(data?.status || '').toUpperCase()
    if (state === 'SUCCESSFUL') {
      validateTransaction(payout, data, data?.externalId, payout.provider_reference)
      return { status: 'completed', providerStatus: state, payload: data }
    }
    if (state === 'FAILED') return { status: 'failed', providerStatus: state, payload: data }
    if (state === 'PENDING') return { status: 'pending', providerStatus: state, payload: data }
    throw new Error(`MTN MoMo returned an unexpected payout status${state ? `: ${state}` : ''}.`)
  }

  if (!payout.provider_txn_id) throw new Error('Airtel Money payout is missing its transaction ID.')
  const { data } = await request(
    config,
    `/standard/v1/disbursements/${encodeURIComponent(payout.provider_txn_id)}`,
    { headers }
  )
  const transaction = data?.data?.transaction
  const state = String(transaction?.status || '').toUpperCase()
  if (state === 'TS' || state === 'SUCCESS' || state === 'SUCCESSFUL') {
    validateTransaction(payout, transaction, transaction?.id, payout.provider_txn_id)
    return { status: 'completed', providerStatus: state, payload: data }
  }
  if (state === 'TF' || state === 'FAILED' || state === 'FAILURE') {
    return { status: 'failed', providerStatus: state, payload: data }
  }
  if (state === 'TIP' || state === 'TA' || state === 'PENDING') {
    return { status: 'pending', providerStatus: state, payload: data }
  }
  throw new Error(`Airtel Money returned an unexpected payout status${state ? `: ${state}` : ''}.`)
}

export async function getMobileMoneyPaymentStatus(payment) {
  const config = getProviderConfig(payment.method)
  const token = payment.method === 'mtn_momo' ? await mtnToken(config) : await airtelToken(config)
  const headers = providerHeaders(config, token)

  if (payment.method === 'mtn_momo') {
    const { data } = await request(
      config,
      `/collection/v1_0/requesttopay/${encodeURIComponent(payment.reference)}`,
      { headers }
    )
    const state = String(data?.status || '').toUpperCase()
    if (state === 'SUCCESSFUL') {
      validateTransaction(payment, data, data?.externalId, payment.reference)
      return { status: 'completed', providerStatus: state, payload: data }
    }
    if (state === 'FAILED') return { status: 'failed', providerStatus: state, payload: data }
    if (state === 'PENDING') return { status: 'pending', providerStatus: state, payload: data }
    throw new Error(`MTN MoMo returned an unexpected payment status${state ? `: ${state}` : ''}.`)
  }

  if (!payment.provider_txn_id) throw new Error('Airtel Money payment is missing its transaction ID.')
  const { data } = await request(
    config,
    `/standard/v1/payments/${encodeURIComponent(payment.provider_txn_id)}`,
    { headers }
  )
  const state = String(data?.data?.transaction?.status || '').toUpperCase()
  if (state === 'TS' || state === 'SUCCESS' || state === 'SUCCESSFUL') {
    validateTransaction(payment, data?.data?.transaction, data?.data?.transaction?.id, payment.provider_txn_id)
    return { status: 'completed', providerStatus: state, payload: data }
  }
  if (state === 'TF' || state === 'FAILED' || state === 'FAILURE') {
    return { status: 'failed', providerStatus: state, payload: data }
  }
  if (state === 'TIP' || state === 'TA' || state === 'PENDING') {
    return { status: 'pending', providerStatus: state, payload: data }
  }
  throw new Error(`Airtel Money returned an unexpected payment status${state ? `: ${state}` : ''}.`)
}

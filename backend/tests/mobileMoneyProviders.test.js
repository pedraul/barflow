import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getMobileMoneyPaymentStatus,
  normalizeRwandaPhone,
  requestMobileMoneyPayment,
} from '../services/mobileMoneyProviders.js'
import { createOutboundPayoutRequest } from '../services/outboundPayoutService.js'

const environmentKeys = [
  'MTN_MOMO_BASE_URL',
  'MTN_MOMO_TARGET_ENVIRONMENT',
  'MTN_MOMO_SUBSCRIPTION_KEY',
  'MTN_MOMO_API_USER',
  'MTN_MOMO_API_KEY',
  'MTN_MOMO_DISBURSEMENT_BASE_URL',
  'MTN_MOMO_DISBURSEMENT_SUBSCRIPTION_KEY',
  'MTN_MOMO_DISBURSEMENT_API_USER',
  'MTN_MOMO_DISBURSEMENT_API_KEY',
  'AIRTEL_MONEY_BASE_URL',
  'AIRTEL_MONEY_CLIENT_ID',
  'AIRTEL_MONEY_CLIENT_SECRET',
  'AIRTEL_MONEY_COUNTRY',
  'AIRTEL_MONEY_CURRENCY',
]

function withEnvironment(values, run) {
  const previous = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]))
  Object.assign(process.env, values)
  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const key of environmentKeys) {
        if (previous[key] === undefined) delete process.env[key]
        else process.env[key] = previous[key]
      }
    })
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body == null ? '' : JSON.stringify(body),
  }
}

function paymentIdFromUrl(url) {
  return url.split('/').pop()
}

test('normalizes local Rwanda mobile numbers and rejects invalid numbers', () => {
  assert.equal(normalizeRwandaPhone('0788 123 456'), '250788123456')
  assert.equal(normalizeRwandaPhone('+250 788 123 456'), '250788123456')
  assert.throws(() => normalizeRwandaPhone('071234'), /valid Rwanda mobile number/)
})

test('validates and normalizes outbound payout requests', () => {
  assert.deepEqual(
    createOutboundPayoutRequest({ phone: '0788 123 456', amount: '1200', method: 'mtn_momo' }),
    { phone: '250788123456', amount: 1200, method: 'mtn_momo' }
  )
  assert.throws(
    () => createOutboundPayoutRequest({ phone: '', amount: 1200, method: 'airtel_money' }),
    /recipient phone number is required/
  )
  assert.throws(
    () => createOutboundPayoutRequest({ phone: '0788123456', amount: 0, method: 'mtn_momo' }),
    /greater than zero/
  )
  assert.throws(
    () => createOutboundPayoutRequest({ phone: '0788123456', amount: 1200, method: 'cash' }),
    /Choose MTN MoMo or Airtel Money/
  )
})

test('requests and checks an MTN MoMo collection using the provider API', async () => {
  await withEnvironment({
    MTN_MOMO_BASE_URL: 'https://mtn.test',
    MTN_MOMO_TARGET_ENVIRONMENT: 'sandbox',
    MTN_MOMO_SUBSCRIPTION_KEY: 'subscription',
    MTN_MOMO_API_USER: 'api-user',
    MTN_MOMO_API_KEY: 'api-key',
  }, async () => {
    const originalFetch = globalThis.fetch
    const requests = []
    globalThis.fetch = async (url, options) => {
      requests.push({ url, options })
      if (url.endsWith('/collection/token/')) return response(200, { access_token: 'mtn-token', expires_in: 3600 })
      if (url.endsWith('/collection/v1_0/requesttopay')) return response(202)
      return response(200, {
        status: 'SUCCESSFUL',
        amount: '12500',
        currency: 'RWF',
        externalId: 'mtn-order-reference',
      })
    }

    try {
      const payment = await requestMobileMoneyPayment({
        method: 'mtn_momo',
        reference: 'mtn-order-reference',
        amount: 12500,
        phone: '0788123456',
      })
      assert.equal(payment.provider, 'mtn_momo')
      assert.equal(payment.providerStatus, 'PENDING')
      const requestBody = JSON.parse(requests[1].options.body)
      assert.equal(requestBody.amount, '12500')
      assert.equal(requestBody.currency, 'RWF')
      assert.equal(requestBody.payer.partyId, '250788123456')

      const status = await getMobileMoneyPaymentStatus({
        method: 'mtn_momo',
        reference: 'mtn-order-reference',
        amount: 12500,
      })
      assert.equal(status.status, 'completed')
      assert.equal(status.providerStatus, 'SUCCESSFUL')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

test('requests and checks an Airtel Money collection using the provider API', async () => {
  await withEnvironment({
    AIRTEL_MONEY_BASE_URL: 'https://airtel.test',
    AIRTEL_MONEY_CLIENT_ID: 'airtel-client',
    AIRTEL_MONEY_CLIENT_SECRET: 'airtel-secret',
    AIRTEL_MONEY_COUNTRY: 'RW',
    AIRTEL_MONEY_CURRENCY: 'RWF',
  }, async () => {
    const originalFetch = globalThis.fetch
    const requests = []
    globalThis.fetch = async (url, options) => {
      requests.push({ url, options })
      if (url.endsWith('/auth/oauth2/token')) return response(200, { access_token: 'airtel-token', expires_in: 3600 })
      if (url.endsWith('/merchant/v1/payments/')) {
        const requestBody = JSON.parse(options.body)
        return response(200, { data: { transaction: { id: requestBody.transaction.id } } })
      }
      return response(200, {
        data: {
          transaction: {
            id: paymentIdFromUrl(url),
            status: 'TS',
            amount: '12500',
            currency: 'RWF',
          },
        },
      })
    }

    try {
      const payment = await requestMobileMoneyPayment({
        method: 'airtel_money',
        reference: 'airtel-order-reference',
        amount: 12500,
        phone: '0788123456',
      })

      assert.equal(payment.provider, 'airtel_money')
      assert.equal(requests[1].options.headers['X-Country'], 'RW')
      assert.equal(requests[1].options.headers['X-Currency'], 'RWF')
      assert.equal(JSON.parse(requests[1].options.body).subscriber.msisdn, '250788123456')

      const status = await getMobileMoneyPaymentStatus({
        method: 'airtel_money',
        provider_txn_id: payment.providerTxnId,
        amount: 12500,
      })
      assert.equal(status.status, 'completed')
      assert.equal(status.providerStatus, 'TS')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

test('does not accept provider confirmation with a mismatched amount', async () => {
  await withEnvironment({
    MTN_MOMO_BASE_URL: 'https://mtn.test',
    MTN_MOMO_SUBSCRIPTION_KEY: 'subscription',
    MTN_MOMO_API_USER: 'api-user',
    MTN_MOMO_API_KEY: 'api-key',
  }, async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (url) => {
      if (url.endsWith('/collection/token/')) return response(200, { access_token: 'mtn-token', expires_in: 3600 })
      return response(200, {
        status: 'SUCCESSFUL',
        amount: '100',
        currency: 'RWF',
        externalId: 'expected-reference',
      })
    }

    try {
      await assert.rejects(
        getMobileMoneyPaymentStatus({
          method: 'mtn_momo',
          reference: 'expected-reference',
          amount: 12500,
        }),
        /amount does not match/
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

test('sends and verifies an MTN MoMo disbursement', async () => {
  await withEnvironment({
    MTN_MOMO_DISBURSEMENT_BASE_URL: 'https://mtn-payout.test',
    MTN_MOMO_TARGET_ENVIRONMENT: 'sandbox',
    MTN_MOMO_DISBURSEMENT_SUBSCRIPTION_KEY: 'disbursement-subscription',
    MTN_MOMO_DISBURSEMENT_API_USER: 'disbursement-user',
    MTN_MOMO_DISBURSEMENT_API_KEY: 'disbursement-key',
  }, async () => {
    const originalFetch = globalThis.fetch
    const requests = []
    globalThis.fetch = async (url, options) => {
      requests.push({ url, options })
      if (url.endsWith('/disbursement/token/')) return response(200, { access_token: 'payout-token', expires_in: 3600 })
      if (url.endsWith('/disbursement/v1_0/transfer')) return response(202)
      return response(200, {
        status: 'SUCCESSFUL',
        amount: '12500',
        currency: 'RWF',
        externalId: 'salary-reference',
      })
    }

    try {
      const { requestMobileMoneyPayout, getMobileMoneyPayoutStatus } = await import('../services/mobileMoneyProviders.js')
      const payout = await requestMobileMoneyPayout({
        method: 'mtn_momo',
        reference: 'salary-reference',
        transactionId: 'salary-reference',
        amount: 12500,
        phone: '0788123456',
      })
      assert.equal(payout.providerStatus, 'PENDING')
      const payoutRequest = requests[1]
      const body = JSON.parse(payoutRequest.options.body)
      assert.equal(payoutRequest.url, 'https://mtn-payout.test/disbursement/v1_0/transfer')
      assert.equal(payoutRequest.options.headers['Ocp-Apim-Subscription-Key'], 'disbursement-subscription')
      assert.equal(body.payee.partyId, '250788123456')
      assert.equal(body.amount, '12500')

      const result = await getMobileMoneyPayoutStatus({
        method: 'mtn_momo',
        provider_reference: 'salary-reference',
        provider_txn_id: 'salary-reference',
        amount: 12500,
      })
      assert.equal(result.status, 'completed')
      assert.equal(result.providerStatus, 'SUCCESSFUL')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

test('sends and verifies an Airtel Money disbursement', async () => {
  await withEnvironment({
    AIRTEL_MONEY_BASE_URL: 'https://airtel-payout.test',
    AIRTEL_MONEY_CLIENT_ID: 'airtel-payout-client',
    AIRTEL_MONEY_CLIENT_SECRET: 'airtel-payout-secret',
    AIRTEL_MONEY_COUNTRY: 'RW',
    AIRTEL_MONEY_CURRENCY: 'RWF',
  }, async () => {
    const originalFetch = globalThis.fetch
    const requests = []
    globalThis.fetch = async (url, options) => {
      requests.push({ url, options })
      if (url.endsWith('/auth/oauth2/token')) return response(200, { access_token: 'airtel-payout-token', expires_in: 3600 })
      if (url.endsWith('/standard/v1/disbursements/')) return response(200)
      return response(200, {
        data: {
          transaction: {
            id: 'airtel-transaction-id',
            status: 'TS',
            amount: '12500',
            currency: 'RWF',
          },
        },
      })
    }

    try {
      const { requestMobileMoneyPayout, getMobileMoneyPayoutStatus } = await import('../services/mobileMoneyProviders.js')
      const payout = await requestMobileMoneyPayout({
        method: 'airtel_money',
        reference: 'airtel-salary-reference',
        transactionId: 'airtel-transaction-id',
        amount: 12500,
        phone: '0788123456',
      })
      assert.equal(payout.providerStatus, 'PENDING')
      const payoutRequest = requests[1]
      const body = JSON.parse(payoutRequest.options.body)
      assert.equal(payoutRequest.url, 'https://airtel-payout.test/standard/v1/disbursements/')
      assert.equal(body.payee.msisdn, '250788123456')
      assert.equal(body.transaction.id, 'airtel-transaction-id')
      assert.equal(payoutRequest.options.headers['X-Currency'], 'RWF')

      const result = await getMobileMoneyPayoutStatus({
        method: 'airtel_money',
        provider_txn_id: 'airtel-transaction-id',
        amount: 12500,
      })
      assert.equal(result.status, 'completed')
      assert.equal(result.providerStatus, 'TS')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

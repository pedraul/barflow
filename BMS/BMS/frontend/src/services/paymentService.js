import axios from 'axios'

const API = axios.create({ baseURL: window?.__API_BASE__ || '/api' })

export async function initiateMomoPayment({ orderId, amount, method = 'mtn_momo', customerPhone, customerName }) {
  const res = await API.post('/payments/momo/initiate', { orderId, amount, method, customerPhone, customerName })
  return res.data
}

export async function getPaymentStatus(paymentId) {
  const res = await API.get(`/payments/momo/${paymentId}/status`)
  return res.data
}

export default { initiateMomoPayment, getPaymentStatus }

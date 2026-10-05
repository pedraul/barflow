// Rwanda PAYE tax brackets (monthly, in RWF)
// Bracket 1: 0 - 60,000 => 0%
// Bracket 2: 60,001 - 200,000 => 10%
// Bracket 3: 200,001 - 1,000,000 => 15%
// Bracket 4: 1,000,001+ => 20%
const BRACKETS = [
  { limit: 60000, rate: 0 },
  { limit: 200000, rate: 0.10 },
  { limit: 1000000, rate: 0.15 },
  { limit: Infinity, rate: 0.20 },
]

const INSURANCE_DEDUCTION = 2000

export function calculateRwandaTax(grossSalary) {
  const gross = Number(grossSalary) || 0
  if (gross <= 0) return { gross, tax: 0, insurance: INSURANCE_DEDUCTION, net: 0 }

  let tax = 0
  let previousLimit = 0

  for (const bracket of BRACKETS) {
    if (gross > previousLimit) {
      const taxableInBracket = Math.min(gross, bracket.limit) - previousLimit
      tax += taxableInBracket * bracket.rate
    }
    previousLimit = bracket.limit
    if (gross <= bracket.limit) break
  }

  const insurance = INSURANCE_DEDUCTION
  const net = Math.max(0, gross - tax - insurance)

  return {
    gross,
    tax: Math.round(tax),
    insurance,
    net: Math.round(net),
  }
}

export function getTaxBreakdown(grossSalary) {
  const result = calculateRwandaTax(grossSalary)
  return {
    grossAmount: result.gross,
    taxAmount: result.tax,
    insuranceAmount: result.insurance,
    netAmount: result.net,
  }
}

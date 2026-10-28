export type BillingCalculation = {
  clientChargeCents: number
  providerCostMicros: bigint
  pricingVersionId: string
}

function roundHalfUp(value: bigint, divisor: bigint) {
  return (value + divisor / 2n) / divisor
}

export function calculateClientCharge(input: {
  providerCostMicros: bigint
  markupBasisPoints: number
  pricingVersionId: string
}): BillingCalculation {
  if (input.providerCostMicros < 0n) throw new Error('Provider cost cannot be negative.')
  if (!Number.isInteger(input.markupBasisPoints) || input.markupBasisPoints < 0 || input.markupBasisPoints > 10_000) {
    throw new Error('Markup basis points must be an integer between 0 and 10000.')
  }
  if (!input.pricingVersionId) throw new Error('A pricing version is required.')

  const factor = BigInt(10_000 + input.markupBasisPoints)
  const chargeCents = roundHalfUp(input.providerCostMicros * factor, 100_000_000n)
  if (chargeCents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Calculated charge exceeds the safe integer range.')
  return {
    clientChargeCents: Number(chargeCents),
    providerCostMicros: input.providerCostMicros,
    pricingVersionId: input.pricingVersionId,
  }
}

export function invoiceIdempotencyKey(accountId: string, periodStart: string, periodEnd: string) {
  if (!accountId || !/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
    throw new Error('A billing account and ISO billing period are required.')
  }
  return `ai-usage:${accountId}:${periodStart}:${periodEnd}`
}

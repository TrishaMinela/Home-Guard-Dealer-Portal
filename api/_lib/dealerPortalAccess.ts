import { DEALER_UNAVAILABLE_MESSAGE } from '../../src/utils/dealerUnavailable.js'

export { DEALER_UNAVAILABLE_MESSAGE }

export function dealerLogoRequestAccess(input: {
  isHomeGuardAdmin: boolean
  isDealerAdminForDealer: boolean
  dealerIsActive: boolean
}): { allowed: true } | { allowed: false; status: 403; message: string } {
  if (input.isHomeGuardAdmin) return { allowed: true }
  if (!input.isDealerAdminForDealer) return { allowed: false, status: 403, message: 'Dealer logo access required.' }
  if (!input.dealerIsActive) return { allowed: false, status: 403, message: DEALER_UNAVAILABLE_MESSAGE }
  return { allowed: true }
}

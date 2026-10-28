import type { AdminDealer } from './admin'

export type DealerAccount = AdminDealer

export type AccountAccess =
  | { userId: string; type: 'admin'; dealer: null; message: ''; isInternalBillingAdmin: boolean }
  | { userId: string; type: 'billing_client'; dealer: null; message: ''; billingAccounts: Array<{ id: string; name: string }> }
  | { userId: string; type: 'dealer'; dealer: DealerAccount; message: '' }
  | { userId: string; type: 'none'; dealer: null; message: string }

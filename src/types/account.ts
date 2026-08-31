import type { AdminDealer } from './admin'

export type DealerAccount = AdminDealer

export type AccountAccess =
  | { userId: string; type: 'admin'; dealer: null; message: '' }
  | { userId: string; type: 'dealer'; dealer: DealerAccount; message: '' }
  | { userId: string; type: 'none'; dealer: null; message: string }

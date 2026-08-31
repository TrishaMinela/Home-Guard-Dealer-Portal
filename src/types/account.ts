export type DealerAccount = {
  company_name: string
}

export type AccountAccess =
  | { userId: string; type: 'admin'; dealer: null; message: '' }
  | { userId: string; type: 'dealer'; dealer: DealerAccount; message: '' }
  | { userId: string; type: 'none'; dealer: null; message: string }

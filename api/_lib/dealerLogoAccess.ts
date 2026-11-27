export function dealerLogoAccessAllowed(isHomeGuardAdmin: boolean, isDealerAdminForRequestedDealer: boolean): boolean {
  return isHomeGuardAdmin || isDealerAdminForRequestedDealer
}

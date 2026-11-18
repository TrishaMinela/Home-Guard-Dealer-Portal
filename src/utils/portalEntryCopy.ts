export function portalEntryCopy(destination: string) {
  if (destination.startsWith('/admin')) {
    return {
      summary: 'You have been invited to the Home Guard admin portal.',
      benefits: ['Dealers', 'Leads', 'Inventory'],
      button: 'Go to Home Guard Admin',
    }
  }
  if (destination.startsWith('/billing')) {
    return {
      summary: 'You have been invited to Home Guard billing.',
      benefits: ['Billing Overview', 'AI Usage Charges', 'Billing History'],
      button: 'Go to Billing',
    }
  }
  if (destination.startsWith('/dashboard')) {
    return {
      summary: 'You have been invited to your dealer portal.',
      benefits: ['Dashboard', 'Leads', 'Marketing Tools'],
      button: 'Go to Dealer Portal',
    }
  }
  return {
    summary: 'Your Home Guard portal access is ready.',
    benefits: ['Your authorized pages'],
    button: 'Continue to Portal',
  }
}

import { DealerUserAccess } from './components/DealerUserAccess'

const previewUsers = [
  {
    name: 'Alex Sample',
    email: 'alex.admin@northwind.example',
    status: 'active' as const,
    role: 'dealer_admin',
    accessGrantedAt: '2026-01-15T15:00:00.000Z',
    invitedAt: '2026-01-10T15:00:00.000Z',
    lastSignInAt: '2026-11-01T15:00:00.000Z',
  },
  {
    name: 'Jordan Sample',
    email: 'jordan.member@northwind.example',
    status: 'pending' as const,
    role: 'dealer_member',
    accessGrantedAt: '2026-02-02T15:00:00.000Z',
    invitedAt: '2026-02-02T15:00:00.000Z',
    lastSignInAt: null,
  },
]

export function DealerAccessHarness() {
  return (
    <main className="page-content" style={{ maxWidth: 1100, margin: '0 auto' }}>
      <DealerUserAccess dealerId="22222222-2222-4222-8222-222222222222" previewUsers={previewUsers} />
    </main>
  )
}

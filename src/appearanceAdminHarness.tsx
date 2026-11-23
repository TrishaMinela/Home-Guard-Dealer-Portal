import { DealerDetailSectionNav } from './components/DealerDetailSectionNav'
import './App.css'

export function AdminNavHarness() {
  return (
    <div className="dealer-detail-page">
      <DealerDetailSectionNav canManageDealerCredentials canManageDealerUsers />
      <div id="company-details" style={{ height: 720 }}>Company Details</div>
      <section id="branding-studio" style={{ height: 720 }}>
        <h2>Branding Studio</h2>
      </section>
      <div id="door-builder-lead-webhook" style={{ height: 360 }}>Webhook</div>
      <div id="marketing-tools" style={{ height: 240 }}>Marketing</div>
      <div id="crm-integrations" style={{ height: 240 }}>CRM</div>
      <div id="dealer-users" style={{ height: 240 }}>Users</div>
    </div>
  )
}

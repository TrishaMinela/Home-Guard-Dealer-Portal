import { DealerDetailSectionNav } from './components/DealerDetailSectionNav'
import './App.css'

export function AdminNavHarness() {
  return (
    <div className="dealer-detail-page">
      <DealerDetailSectionNav canManageDealerCredentials canManageDealerUsers />
      <div id="company-details" style={{ height: 720 }}>Company Details</div>
      <div id="branding" style={{ height: 720 }}>Branding</div>
      <section id="door-builder-appearance" style={{ height: 480 }}>
        <h2>Door Builder Appearance</h2>
      </section>
      <div id="design" style={{ height: 360 }}>Typography</div>
      <div id="door-builder-lead-webhook" style={{ height: 360 }}>Webhook</div>
      <div id="marketing-tools" style={{ height: 240 }}>Marketing</div>
      <div id="crm-integrations" style={{ height: 240 }}>CRM</div>
      <div id="dealer-users" style={{ height: 240 }}>Users</div>
    </div>
  )
}

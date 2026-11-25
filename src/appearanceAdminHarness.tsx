import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { DealerDetailSectionNav } from './components/DealerDetailSectionNav'
import './App.css'

function PathProbe() {
  const location = useLocation()
  return <div data-testid="dealer-nav-path">{location.pathname}</div>
}

function NavWithId() {
  const { dealerId = '' } = useParams()
  return (
    <>
      <DealerDetailSectionNav dealerId={dealerId} canManageDealerCredentials canManageDealerUsers />
      <PathProbe />
    </>
  )
}

export function AdminNavHarness() {
  return (
    <MemoryRouter initialEntries={['/admin/dealers/test-dealer']}>
      <div className="dealer-detail-page">
        <Routes>
          <Route path="/admin/dealers/:dealerId/*" element={<NavWithId />} />
          <Route path="/admin/dealers/:dealerId" element={<NavWithId />} />
        </Routes>
      </div>
    </MemoryRouter>
  )
}

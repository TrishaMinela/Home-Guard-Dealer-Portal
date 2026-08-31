import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DealerForm } from '../components/DealerForm'
import { supabase } from '../lib/supabase'
import type { AdminDealer, DealerFormValues } from '../types/admin'

type EditDealerPageProps = {
  dealers: AdminDealer[]
  isLoading: boolean
  error: string
  onSaved: (dealer: AdminDealer) => void
}

function optionalValue(value: string) {
  return value.trim() || null
}

function dealerToForm(dealer: AdminDealer): DealerFormValues {
  return {
    companyName: dealer.company_name,
    slug: dealer.slug,
    primaryContactName: dealer.primary_contact_name ?? '',
    email: dealer.email ?? '',
    phone: dealer.phone ?? '',
    website: dealer.website ?? '',
    address: dealer.address ?? '',
    city: dealer.city ?? '',
    state: dealer.state ?? '',
    zip: dealer.zip ?? '',
    primaryColor: dealer.primary_color ?? '',
    secondaryColor: dealer.secondary_color ?? '',
  }
}

export function EditDealerPage({ dealers, isLoading, error, onSaved }: EditDealerPageProps) {
  const { dealerId } = useParams()
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const navigate = useNavigate()
  const dealer = dealers.find((item) => item.id === dealerId)

  if (isLoading) {
    return <div className="page-content"><div className="data-state">Loading dealer...</div></div>
  }

  if (error) {
    return <div className="page-content"><div className="portal-alert" role="alert">{error}</div></div>
  }

  if (!dealer) {
    return <div className="page-content"><div className="data-state">Dealer not found.</div></div>
  }

  async function handleSubmit(values: DealerFormValues, normalizedSlug: string) {
    if (!dealer) return

    setFormError('')
    if (!normalizedSlug) {
      setFormError('Enter a dealer slug using letters or numbers.')
      return
    }

    setIsSubmitting(true)
    const { data, error: updateError } = await supabase
      .from('dealers')
      .update({
        company_name: values.companyName.trim(),
        slug: normalizedSlug,
        primary_contact_name: optionalValue(values.primaryContactName),
        email: optionalValue(values.email),
        phone: optionalValue(values.phone),
        website: optionalValue(values.website),
        address: optionalValue(values.address),
        city: optionalValue(values.city),
        state: optionalValue(values.state),
        zip: optionalValue(values.zip),
        primary_color: optionalValue(values.primaryColor),
        secondary_color: optionalValue(values.secondaryColor),
      })
      .eq('id', dealer.id)
      .select('id, company_name, slug, logo_url, logo_light_url, primary_contact_name, email, phone, website, address, city, state, zip, primary_color, secondary_color, is_active, created_at, requested_slug, slug_request_status, slug_requested_at')
      .single()

    if (updateError) {
      console.error('Failed to update dealer.', updateError)
      setFormError(
        updateError.code === '23505'
          ? 'This dealer URL is already in use. Please choose another slug.'
          : 'We could not save this dealer. Please review the details and try again.',
      )
      setIsSubmitting(false)
      return
    }

    onSaved(data)
    navigate(`/admin/dealers/${dealer.id}`)
  }

  return (
    <div className="page-content">
      <header className="page-header admin-page-header">
        <p className="eyebrow">Home Guard</p>
        <h1>Edit {dealer.company_name}</h1>
        <p>Update this dealer’s company information and visualizer slug.</p>
      </header>

      <DealerForm
        initialValues={dealerToForm(dealer)}
        cancelTo={`/admin/dealers/${dealer.id}`}
        error={formError}
        isSubmitting={isSubmitting}
        submitLabel="Save Changes"
        submittingLabel="Saving..."
        onSubmit={handleSubmit}
      />
    </div>
  )
}

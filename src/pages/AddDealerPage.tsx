import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DealerForm } from '../components/DealerForm'
import { supabase } from '../lib/supabase'
import type { DealerFormValues } from '../types/admin'

type AddDealerPageProps = {
  onCreated: (companyName: string) => void
}

const initialValues: DealerFormValues = {
  companyName: '',
  slug: '',
  primaryContactName: '',
  email: '',
  phone: '',
  website: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  primaryColor: '',
  secondaryColor: '',
}

function optionalValue(value: string) {
  return value.trim() || null
}

export function AddDealerPage({ onCreated }: AddDealerPageProps) {
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(values: DealerFormValues, normalizedSlug: string) {
    setError('')

    if (!normalizedSlug) {
      setError('Enter a dealer slug using letters or numbers.')
      return
    }

    setIsSubmitting(true)
    const { error: insertError } = await supabase.from('dealers').insert({
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
      is_active: true,
    })

    if (insertError) {
      console.error('Failed to create dealer.', insertError)
      setError(
        insertError.code === '23505'
          ? 'This dealer URL is already in use. Please choose another slug.'
          : 'We could not add this dealer. Please review the details and try again.',
      )
      setIsSubmitting(false)
      return
    }

    onCreated(values.companyName.trim())
    navigate('/admin/dealers')
  }

  return (
    <div className="page-content">
      <header className="page-header admin-page-header">
        <p className="eyebrow">Home Guard</p>
        <h1>Add Dealer</h1>
        <p>Create a company record for the Home Guard dealer network.</p>
      </header>

      <DealerForm
        initialValues={initialValues}
        cancelTo="/admin/dealers"
        error={error}
        isSubmitting={isSubmitting}
        submitLabel="Add Dealer"
        submittingLabel="Adding Dealer..."
        onSubmit={handleSubmit}
      />
    </div>
  )
}

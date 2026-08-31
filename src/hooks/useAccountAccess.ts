import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { AccountAccess } from '../types/account'

export function useAccountAccess(user: User | null) {
  const [access, setAccess] = useState<AccountAccess | null>(null)

  useEffect(() => {
    if (!user) return

    let isCurrent = true

    async function resolveAccess(authenticatedUser: User) {
      const { data: adminRecord, error: adminError } = await supabase
        .from('home_guard_admins')
        .select('id')
        .eq('user_id', authenticatedUser.id)
        .maybeSingle()

      if (!isCurrent) return

      if (adminError) {
        console.error('Unable to verify Home Guard admin access.', adminError)
        setAccess({
          userId: authenticatedUser.id,
          type: 'none',
          dealer: null,
          message: 'Unable to verify your account access.',
        })
        return
      }

      if (adminRecord) {
        setAccess({
          userId: authenticatedUser.id,
          type: 'admin',
          dealer: null,
          message: '',
        })
        return
      }

      const { data: membership, error: membershipError } = await supabase
        .from('dealer_users')
        .select('dealer_id')
        .eq('user_id', authenticatedUser.id)
        .limit(1)
        .maybeSingle()

      if (!isCurrent) return

      if (membershipError) {
        console.error('Unable to load dealer membership.', membershipError)
        setAccess({
          userId: authenticatedUser.id,
          type: 'none',
          dealer: null,
          message: 'Unable to load your dealer membership.',
        })
        return
      }

      if (!membership) {
        setAccess({
          userId: authenticatedUser.id,
          type: 'none',
          dealer: null,
          message:
            'Your account is signed in, but it is not associated with a dealer.',
        })
        return
      }

      const { data: dealerRecord, error: dealerError } = await supabase
        .from('dealers')
        .select('company_name')
        .eq('id', membership.dealer_id)
        .single()

      if (!isCurrent) return

      if (dealerError) {
        console.error('Unable to load dealer information.', dealerError)
        setAccess({
          userId: authenticatedUser.id,
          type: 'none',
          dealer: null,
          message: 'Unable to load your dealer information.',
        })
        return
      }

      setAccess({
        userId: authenticatedUser.id,
        type: 'dealer',
        dealer: dealerRecord,
        message: '',
      })
    }

    void resolveAccess(user)

    return () => {
      isCurrent = false
    }
  }, [user])

  return {
    access,
    isLoading: Boolean(user && access?.userId !== user.id),
  }
}

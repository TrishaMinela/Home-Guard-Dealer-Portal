import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { PortalNotification } from '../components/NotificationLauncher'

export type PersistedAdminNotification = PortalNotification & {
  receipt: {
    notificationType: 'lead' | 'slug_request'
    sourceId: string
    sourceVersion: string
  }
}

type NotificationRead = {
  notification_type: string
  source_id: string
  source_version: string
}

function receiptKey(receipt: PersistedAdminNotification['receipt']) {
  return `${receipt.notificationType}:${receipt.sourceId}:${receipt.sourceVersion}`
}

function rowKey(row: NotificationRead) {
  return `${row.notification_type}:${row.source_id}:${row.source_version}`
}

export function useAdminNotifications(allNotifications: PersistedAdminNotification[]) {
  const [readKeys, setReadKeys] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let isCurrent = true

    async function loadReadReceipts() {
      const { data, error: queryError } = await supabase
        .from('notification_reads')
        .select('notification_type, source_id, source_version')

      if (!isCurrent) return

      if (queryError) {
        console.error('Failed to load notification read receipts.', queryError)
        setError('We could not load your notification history. Please refresh and try again.')
        setReadKeys(new Set())
      } else {
        setError('')
        setReadKeys(new Set((data as NotificationRead[]).map(rowKey)))
      }

      setIsLoading(false)
    }

    void loadReadReceipts()
    return () => { isCurrent = false }
  }, [])

  const notifications = useMemo(
    () => allNotifications.filter((notification) => !readKeys.has(receiptKey(notification.receipt))),
    [allNotifications, readKeys],
  )

  const markAsRead = useCallback((notification: PersistedAdminNotification) => {
    const key = receiptKey(notification.receipt)
    if (readKeys.has(key)) return

    setError('')
    setReadKeys((current) => new Set(current).add(key))

    void supabase
      .from('notification_reads')
      .upsert({
        notification_type: notification.receipt.notificationType,
        source_id: notification.receipt.sourceId,
        source_version: notification.receipt.sourceVersion,
      }, {
        onConflict: 'user_id,notification_type,source_id,source_version',
        ignoreDuplicates: true,
      })
      .then(({ error: mutationError }) => {
        if (!mutationError) return

        console.error('Failed to mark notification as read.', mutationError)
        setError('We could not save that notification as read. It may appear again after refresh.')
        setReadKeys((current) => {
          const next = new Set(current)
          next.delete(key)
          return next
        })
      })
  }, [readKeys])

  return { notifications, markAsRead, isLoading, error }
}


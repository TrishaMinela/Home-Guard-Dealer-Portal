import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AiAdminIssue } from '../types/aiAdminIssue'

const issueFields = 'id, workflow_request_id, issue_type, severity, title, admin_summary, recommended_action, failure_stage, failure_category, environment, provider_request_id, occurred_at, first_seen_at, last_seen_at, occurrence_count, status, resolved_at, resolved_by'

export function useAiAdminIssues() {
  const [issues, setIssues] = useState<AiAdminIssue[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from('ai_admin_issues')
      .select(issueFields)
      .eq('status', 'unresolved')
      .order('severity', { ascending: true })
      .order('last_seen_at', { ascending: false })

    if (queryError) {
      console.error('Failed to load AI admin issues.', queryError)
      setError('We could not load AI issue notifications. Please refresh and try again.')
    } else {
      setIssues((data ?? []) as AiAdminIssue[])
      setError('')
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void refresh(), 0)
    const handleRefresh = () => void refresh()
    window.addEventListener('ai-admin-issues-changed', handleRefresh)
    window.addEventListener('focus', handleRefresh)
    return () => {
      window.clearTimeout(timeoutId)
      window.removeEventListener('ai-admin-issues-changed', handleRefresh)
      window.removeEventListener('focus', handleRefresh)
    }
  }, [refresh])

  return { issues, isLoading, error, refresh }
}

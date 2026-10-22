export type AiAdminIssue = {
  id: string
  workflow_request_id: string
  issue_type: string
  severity: 'critical' | 'warning'
  title: string
  admin_summary: string
  recommended_action: string
  failure_stage: string
  failure_category: string
  environment: string
  provider_request_id: string | null
  occurred_at: string
  first_seen_at: string
  last_seen_at: string
  occurrence_count: number
  status: 'unresolved' | 'resolved'
  resolved_at: string | null
  resolved_by: string | null
}

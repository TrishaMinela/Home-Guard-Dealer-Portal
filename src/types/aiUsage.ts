export type AiGenerationUsage = {
  id: string
  created_at: string
  completed_at: string | null
  status: 'succeeded' | 'failed'
  model: string
  quality: string | null
  output_size: string | null
  output_format: string | null
  input_tokens: number | null
  text_input_tokens: number | null
  image_input_tokens: number | null
  output_tokens: number | null
  image_output_tokens: number | null
  total_tokens: number | null
  estimated_cost_usd: number | null
  openai_generation_duration_ms: number | null
  total_api_duration_ms: number | null
  total_visualization_duration_ms: number | null
  entrance_stage_duration_ms: number | null
  environment: 'production' | 'preview' | 'development' | null
  request_id: string
  error_code: string | null
}

export type AiEntranceDetectionUsage = {
  id: string
  created_at: string
  completed_at: string | null
  status: 'succeeded' | 'failed'
  environment: 'production' | 'preview' | 'development'
  model: string
  pass_type: 'primary' | 'verification'
  input_tokens: number | null
  cached_input_tokens: number | null
  output_tokens: number | null
  reasoning_tokens: number | null
  total_tokens: number | null
  estimated_cost_usd: number | null
  detection_duration_ms: number | null
  request_id: string
  workflow_request_id: string
  error_code: string | null
}

export type AiVisualizationWorkflow = {
  id: string
  workflow_request_id: string
  started_at: string
  completed_at: string | null
  environment: 'production' | 'preview' | 'development'
  status: 'started' | 'succeeded' | 'failed'
  failure_stage: 'entrance_analysis' | 'image_generation' | 'application_infrastructure' | null
  failure_category: string | null
  analysis_request_id: string | null
  analysis_provider_request_id: string | null
  generation_request_id: string | null
  generation_provider_request_id: string | null
  estimated_total_cost_usd: number | null
  duration_ms: number | null
  created_at: string
}

export type AiUsagePeriod = 'today' | '7-days' | '30-days' | 'this-month' | 'custom'

export type AiProviderActivityDaily = {
  id: string
  provider: string
  provider_project_id: string
  usage_date: string
  period_start_at: string
  period_end_at: string
  provider_model: string
  telemetry_model: string
  operation_type: 'image_generation' | 'entrance_analysis' | 'unclassified'
  request_count: number
  input_tokens: number
  output_tokens: number
  cached_input_tokens: number
  text_input_tokens: number
  text_output_tokens: number
  image_input_tokens: number
  image_output_tokens: number
  calculated_estimated_cost_usd: number | null
}

export type AiProviderCostDaily = {
  id: string
  provider: string
  reconciled_project_id: string
  export_project_id: string | null
  usage_date: string
  actual_cost_usd: number
  currency: string
  scope_verification: string
}
export type AiUsageEnvironment = 'all' | 'production' | 'preview' | 'development'

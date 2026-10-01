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

export type AiUsagePeriod = 'today' | '7-days' | '30-days' | 'this-month'
export type AiUsageEnvironment = 'all' | 'production' | 'preview' | 'development'

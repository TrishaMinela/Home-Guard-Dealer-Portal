import { runDailyProviderSync } from './openaiProviderDailySync.ts'

export async function runOpenAiProviderSync(now?: Date) {
  return runDailyProviderSync({
    adminApiKey: process.env.OPENAI_ADMIN_API_KEY ?? '',
    cronSecret: process.env.CRON_SECRET ?? '',
    supabaseUrl: process.env.VITE_SUPABASE_URL ?? '',
    supabasePublishableKey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
    now,
  })
}

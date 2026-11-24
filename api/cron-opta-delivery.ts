import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleOptaDeliveryCron, productionWorkerDeps } from './_lib/optaDeliveryHttp.js'

// Vercel Hobby allows one cron run per day. vercel.json schedules this at 04:15 UTC.
// The worker still waits 1m, 5m, 30m, 2h, and 6h between attempts; a daily sweep
// retries whatever is already due. A per-minute schedule needs a Pro plan.

type JsonResponse = ServerResponse<IncomingMessage> & { json?: (value: unknown) => void }

export default function handler(request: IncomingMessage, response: JsonResponse) {
  return handleOptaDeliveryCron(request, response, productionWorkerDeps())
}

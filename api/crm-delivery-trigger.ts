import type { IncomingMessage, ServerResponse } from 'node:http'
import { handleCrmDeliveryTrigger, productionWorkerDeps } from './_lib/optaDeliveryHttp.js'

type JsonResponse = ServerResponse<IncomingMessage> & { json?: (value: unknown) => void }

export default function handler(request: IncomingMessage, response: JsonResponse) {
  return handleCrmDeliveryTrigger(request, response, productionWorkerDeps())
}

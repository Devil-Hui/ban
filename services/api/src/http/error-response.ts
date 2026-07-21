import type { ApiErrorCode, ApiErrorResponse } from '@scheduling/contracts';

export function buildErrorResponse(code: ApiErrorCode, message: string, requestId: string): ApiErrorResponse {
  return { error: { code, message, requestId } };
}

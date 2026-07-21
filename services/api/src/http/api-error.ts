import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiErrorCode } from '@scheduling/contracts';

/**
 * Business/domain error that carries a stable machine-readable `code`
 * (e.g. SHARE_TOKEN_USED) distinct from the generic HTTP-status mapping
 * produced by `ApiExceptionFilter`. Frontends switch on `error.code`.
 */
export class ApiError extends HttpException {
  public readonly apiCode: ApiErrorCode;

  constructor(apiCode: ApiErrorCode, message: string, status: number = HttpStatus.BAD_REQUEST) {
    super({ code: apiCode, message }, status);
    this.apiCode = apiCode;
    // Keep `message` a clean user-facing string (HttpException would otherwise
    // stringify the response object).
    this.message = message;
  }
}

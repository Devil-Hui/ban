export const API_ERROR_CODES = {
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
  INTERNAL: 'INTERNAL',
  // 邀请/分享链路（排班小程序增强）
  SHARE_TOKEN_INVALID: 'SHARE_TOKEN_INVALID',
  SHARE_TOKEN_USED: 'SHARE_TOKEN_USED',
  MEMBERSHIP_REQUIRED: 'MEMBERSHIP_REQUIRED',
  RESERVED_NAME_MISMATCH: 'RESERVED_NAME_MISMATCH',
  INVALID_REQUIRED_FIELD: 'INVALID_REQUIRED_FIELD',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

export interface ApiFieldViolation {
  field: string;
  description: string;
}

export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    fieldViolations?: ApiFieldViolation[];
  };
}

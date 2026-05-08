/**
 * Tipos de erro customizados para melhor tratamento de erros
 */

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class GeminiAPIError extends AppError {
  constructor(message: string, originalError?: unknown) {
    super(message, 'GEMINI_API_ERROR', originalError);
    this.name = 'GeminiAPIError';
    Object.setPrototypeOf(this, GeminiAPIError.prototype);
  }
}

export class OpenAIAPIError extends AppError {
  constructor(message: string, originalError?: unknown) {
    super(message, 'OPENAI_API_ERROR', originalError);
    this.name = 'OpenAIAPIError';
    Object.setPrototypeOf(this, OpenAIAPIError.prototype);
  }
}

export class WebhookError extends AppError {
  constructor(
    message: string,
    public statusCode?: number,
    public statusText?: string,
    originalError?: unknown
  ) {
    super(message, 'WEBHOOK_ERROR', originalError);
    this.name = 'WebhookError';
    Object.setPrototypeOf(this, WebhookError.prototype);
  }
}

export class FileParseError extends AppError {
  constructor(message: string, originalError?: unknown) {
    super(message, 'FILE_PARSE_ERROR', originalError);
    this.name = 'FileParseError';
    Object.setPrototypeOf(this, FileParseError.prototype);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, originalError?: unknown) {
    super(message, 'DATABASE_ERROR', originalError);
    this.name = 'DatabaseError';
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public field?: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Extrai uma mensagem de erro legível de qualquer tipo de erro
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  
  return 'Erro desconhecido';
}

/**
 * Extrai detalhes adicionais do erro para logging
 */
export function getErrorDetails(error: unknown): Record<string, unknown> {
  const details: Record<string, unknown> = {
    message: getErrorMessage(error),
  };
  
  if (error instanceof AppError) {
    details.code = error.code;
    if (error.originalError) {
      details.originalError = error.originalError;
    }
  }
  
  if (error instanceof WebhookError) {
    if (error.statusCode) details.statusCode = error.statusCode;
    if (error.statusText) details.statusText = error.statusText;
  }
  
  if (error instanceof ValidationError && error.field) {
    details.field = error.field;
  }
  
  return details;
}


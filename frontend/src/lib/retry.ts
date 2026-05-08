/**
 * Sistema de retry automático com backoff exponencial
 */

export interface RetryOptions {
  maxAttempts?: number; // Número máximo de tentativas (padrão: 3)
  initialDelay?: number; // Delay inicial em ms (padrão: 1000)
  maxDelay?: number; // Delay máximo em ms (padrão: 30000)
  backoffMultiplier?: number; // Multiplicador para backoff exponencial (padrão: 2)
  retryableErrors?: string[]; // Códigos de erro que devem ser retentados
  onRetry?: (attempt: number, error: unknown) => void; // Callback chamado a cada tentativa
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  attempts: number;
  lastError?: unknown;
}

/**
 * Calcula o delay para a próxima tentativa usando backoff exponencial
 */
function calculateDelay(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  backoffMultiplier: number
): number {
  const delay = initialDelay * Math.pow(backoffMultiplier, attempt - 1);
  return Math.min(delay, maxDelay);
}

/**
 * Verifica se um erro é retentável baseado no código de erro
 */
function isRetryableError(error: unknown, retryableErrors?: string[]): boolean {
  if (!retryableErrors || retryableErrors.length === 0) {
    return true; // Por padrão, todos os erros são retentáveis
  }

  if (error && typeof error === 'object') {
    // Verifica se o erro tem um código
    if ('code' in error && typeof error.code === 'string') {
      return retryableErrors.includes(error.code);
    }
    
    // Verifica se o erro tem um errorCode
    if ('errorCode' in error && typeof error.errorCode === 'string') {
      return retryableErrors.includes(error.errorCode);
    }
    
    // Verifica se é uma instância de Error e a mensagem contém algum código
    if (error instanceof Error) {
      return retryableErrors.some(code => error.message.includes(code));
    }
  }

  return true; // Por padrão, assume que é retentável
}

/**
 * Executa uma função com retry automático
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    retryableErrors,
    onRetry,
  } = options;

  let lastError: unknown = undefined;
  let attempts = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt;

    try {
      const data = await fn();
      return {
        success: true,
        data,
        attempts,
      };
    } catch (error) {
      lastError = error;

      // Se não for o último attempt e o erro for retentável, tenta novamente
      if (attempt < maxAttempts && isRetryableError(error, retryableErrors)) {
        const delay = calculateDelay(attempt, initialDelay, maxDelay, backoffMultiplier);
        
        if (onRetry) {
          onRetry(attempt, error);
        }

        // Aguarda antes de tentar novamente
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Se não for retentável ou for a última tentativa, retorna erro
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        attempts,
        lastError: error,
      };
    }
  }

  // Não deveria chegar aqui, mas TypeScript exige
  return {
    success: false,
    error: 'Todas as tentativas falharam',
    attempts,
    lastError,
  };
}

/**
 * Configurações pré-definidas para diferentes tipos de operações
 */
export const RetryConfigs = {
  // Para operações de API (Gemini, Webhook)
  api: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    retryableErrors: [
      'NETWORK_ERROR',
      'TIMEOUT',
      'CONNECTION_ERROR',
      'SERVER_ERROR',
      'RATE_LIMIT',
    ],
  } as RetryOptions,

  // Para operações de banco de dados
  database: {
    maxAttempts: 3,
    initialDelay: 500,
    maxDelay: 5000,
    backoffMultiplier: 2,
    retryableErrors: [
      'DATABASE_ERROR',
      'CONNECTION_ERROR',
    ],
  } as RetryOptions,

  // Para operações críticas que devem ter mais tentativas
  critical: {
    maxAttempts: 5,
    initialDelay: 2000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    retryableErrors: [
      'NETWORK_ERROR',
      'TIMEOUT',
      'CONNECTION_ERROR',
      'SERVER_ERROR',
      'RATE_LIMIT',
      'DATABASE_ERROR',
    ],
  } as RetryOptions,

  // Para operações rápidas com poucas tentativas
  quick: {
    maxAttempts: 2,
    initialDelay: 500,
    maxDelay: 2000,
    backoffMultiplier: 1.5,
  } as RetryOptions,
};

/**
 * Helper para criar uma função com retry automático
 */
export function createRetryableFunction<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: RetryOptions = {}
): T {
  return (async (...args: Parameters<T>) => {
    const result = await withRetry(() => fn(...args), options);
    
    if (!result.success) {
      throw new Error(result.error || 'Operação falhou após todas as tentativas');
    }
    
    return result.data;
  }) as T;
}


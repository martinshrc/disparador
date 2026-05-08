import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry, RetryConfigs, createRetryableFunction } from '../retry';

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('deve executar função com sucesso na primeira tentativa', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    
    const result = await withRetry(fn);
    
    expect(result.success).toBe(true);
    expect(result.data).toBe('success');
    expect(result.attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('deve tentar novamente após falha e ter sucesso', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce('success');
    
    const resultPromise = withRetry(fn, {
      maxAttempts: 3,
      initialDelay: 100,
    });
    
    // Avança o timer para completar o delay
    await vi.advanceTimersByTimeAsync(100);
    
    const result = await resultPromise;
    
    expect(result.success).toBe(true);
    expect(result.data).toBe('success');
    expect(result.attempts).toBe(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('deve falhar após todas as tentativas', async () => {
    const error = new Error('Persistent error');
    const fn = vi.fn().mockRejectedValue(error);
    
    const resultPromise = withRetry(fn, {
      maxAttempts: 3,
      initialDelay: 100,
    });
    
    // Avança os timers para todas as tentativas
    await vi.advanceTimersByTimeAsync(100); // Primeira retry
    await vi.advanceTimersByTimeAsync(200); // Segunda retry
    
    const result = await resultPromise;
    
    expect(result.success).toBe(false);
    expect(result.error).toBe('Persistent error');
    expect(result.attempts).toBe(3);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('deve usar backoff exponencial', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Error'));
    const delays: number[] = [];
    
    const resultPromise = withRetry(fn, {
      maxAttempts: 4,
      initialDelay: 100,
      backoffMultiplier: 2,
      onRetry: (attempt) => {
        delays.push(attempt);
      },
    });
    
    // Avança os timers
    await vi.advanceTimersByTimeAsync(100); // Delay após tentativa 1
    await vi.advanceTimersByTimeAsync(200); // Delay após tentativa 2
    await vi.advanceTimersByTimeAsync(400); // Delay após tentativa 3
    
    await resultPromise;
    
    expect(delays).toEqual([1, 2, 3]);
  });

  it('deve respeitar maxDelay', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Error'));
    
    const resultPromise = withRetry(fn, {
      maxAttempts: 3,
      initialDelay: 1000,
      maxDelay: 2000,
      backoffMultiplier: 10, // Tentaria 10s, mas maxDelay é 2s
    });
    
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(2000);
    
    await resultPromise;
    
    // Verifica que não excedeu o maxDelay
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('não deve retentar erros não retentáveis', async () => {
    const error = new Error('BAD_REQUEST');
    const fn = vi.fn().mockRejectedValue(error);
    
    const result = await withRetry(fn, {
      maxAttempts: 3,
      retryableErrors: ['NETWORK_ERROR', 'TIMEOUT'],
    });
    
    expect(result.success).toBe(false);
    expect(result.attempts).toBe(1); // Apenas uma tentativa
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('deve chamar onRetry callback', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('Error'))
      .mockResolvedValueOnce('success');
    
    const onRetry = vi.fn();
    
    const resultPromise = withRetry(fn, {
      maxAttempts: 3,
      initialDelay: 100,
      onRetry,
    });
    
    await vi.advanceTimersByTimeAsync(100);
    await resultPromise;
    
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
  });
});

describe('RetryConfigs', () => {
  it('deve ter configuração api', () => {
    expect(RetryConfigs.api).toHaveProperty('maxAttempts', 3);
    expect(RetryConfigs.api).toHaveProperty('initialDelay', 1000);
    expect(RetryConfigs.api.retryableErrors).toContain('NETWORK_ERROR');
  });

  it('deve ter configuração database', () => {
    expect(RetryConfigs.database).toHaveProperty('maxAttempts', 3);
    expect(RetryConfigs.database).toHaveProperty('initialDelay', 500);
  });

  it('deve ter configuração critical', () => {
    expect(RetryConfigs.critical).toHaveProperty('maxAttempts', 5);
    expect(RetryConfigs.critical).toHaveProperty('maxDelay', 30000);
  });

  it('deve ter configuração quick', () => {
    expect(RetryConfigs.quick).toHaveProperty('maxAttempts', 2);
    expect(RetryConfigs.quick).toHaveProperty('initialDelay', 500);
  });
});

describe('createRetryableFunction', () => {
  it('deve criar função com retry automático', async () => {
    const originalFn = vi.fn()
      .mockRejectedValueOnce(new Error('Error'))
      .mockResolvedValueOnce('success');
    
    const retryableFn = createRetryableFunction(originalFn, {
      maxAttempts: 3,
      initialDelay: 100,
    });
    
    vi.useFakeTimers();
    const resultPromise = retryableFn('arg1', 'arg2');
    await vi.advanceTimersByTimeAsync(100);
    const result = await resultPromise;
    vi.useRealTimers();
    
    expect(result).toBe('success');
    expect(originalFn).toHaveBeenCalledTimes(2);
    expect(originalFn).toHaveBeenCalledWith('arg1', 'arg2');
  });

  it('deve lançar erro se todas as tentativas falharem', async () => {
    const originalFn = vi.fn().mockRejectedValue(new Error('Persistent error'));
    
    const retryableFn = createRetryableFunction(originalFn, {
      maxAttempts: 2,
      initialDelay: 100,
    });
    
    vi.useFakeTimers();
    const resultPromise = retryableFn();
    const expectRejection = expect(resultPromise).rejects.toThrow('Persistent error');
    await vi.runAllTimersAsync();
    await expectRejection;
    vi.useRealTimers();
  });
});


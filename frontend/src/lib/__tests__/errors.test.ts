import { describe, it, expect } from 'vitest';
import {
  AppError,
  GeminiAPIError,
  WebhookError,
  FileParseError,
  DatabaseError,
  ValidationError,
  getErrorMessage,
  getErrorDetails,
} from '../errors';

describe('AppError', () => {
  it('deve criar erro com mensagem e código', () => {
    const error = new AppError('Test error', 'TEST_CODE');
    
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
    expect(error.name).toBe('AppError');
  });

  it('deve armazenar erro original', () => {
    const originalError = new Error('Original');
    const error = new AppError('Test error', 'TEST_CODE', originalError);
    
    expect(error.originalError).toBe(originalError);
  });
});

describe('GeminiAPIError', () => {
  it('deve criar erro específico da API Gemini', () => {
    const error = new GeminiAPIError('API error');
    
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(GeminiAPIError);
    expect(error.code).toBe('GEMINI_API_ERROR');
    expect(error.name).toBe('GeminiAPIError');
  });
});

describe('WebhookError', () => {
  it('deve criar erro com status code', () => {
    const error = new WebhookError('Webhook error', 500, 'Internal Server Error');
    
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(WebhookError);
    expect(error.statusCode).toBe(500);
    expect(error.statusText).toBe('Internal Server Error');
    expect(error.code).toBe('WEBHOOK_ERROR');
  });
});

describe('FileParseError', () => {
  it('deve criar erro de parsing de arquivo', () => {
    const error = new FileParseError('Parse error');
    
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(FileParseError);
    expect(error.code).toBe('FILE_PARSE_ERROR');
  });
});

describe('DatabaseError', () => {
  it('deve criar erro de banco de dados', () => {
    const error = new DatabaseError('Database error');
    
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(DatabaseError);
    expect(error.code).toBe('DATABASE_ERROR');
  });
});

describe('ValidationError', () => {
  it('deve criar erro de validação com campo', () => {
    const error = new ValidationError('Validation error', 'email');
    
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.field).toBe('email');
  });

  it('deve criar erro de validação sem campo', () => {
    const error = new ValidationError('Validation error');
    
    expect(error.field).toBeUndefined();
  });
});

describe('getErrorMessage', () => {
  it('deve extrair mensagem de AppError', () => {
    const error = new AppError('Test error', 'TEST_CODE');
    expect(getErrorMessage(error)).toBe('Test error');
  });

  it('deve extrair mensagem de Error', () => {
    const error = new Error('Standard error');
    expect(getErrorMessage(error)).toBe('Standard error');
  });

  it('deve extrair mensagem de string', () => {
    expect(getErrorMessage('String error')).toBe('String error');
  });

  it('deve extrair mensagem de objeto com message', () => {
    const error = { message: 'Object error' };
    expect(getErrorMessage(error)).toBe('Object error');
  });

  it('deve retornar mensagem padrão para erro desconhecido', () => {
    expect(getErrorMessage(null)).toBe('Erro desconhecido');
    expect(getErrorMessage(undefined)).toBe('Erro desconhecido');
    expect(getErrorMessage({})).toBe('Erro desconhecido');
  });
});

describe('getErrorDetails', () => {
  it('deve extrair detalhes de AppError', () => {
    const originalError = new Error('Original');
    const error = new AppError('Test error', 'TEST_CODE', originalError);
    const details = getErrorDetails(error);
    
    expect(details.message).toBe('Test error');
    expect(details.code).toBe('TEST_CODE');
    expect(details.originalError).toBe(originalError);
  });

  it('deve extrair detalhes de WebhookError', () => {
    const error = new WebhookError('Webhook error', 500, 'Internal Server Error');
    const details = getErrorDetails(error);
    
    expect(details.message).toBe('Webhook error');
    expect(details.statusCode).toBe(500);
    expect(details.statusText).toBe('Internal Server Error');
  });

  it('deve extrair detalhes de ValidationError', () => {
    const error = new ValidationError('Validation error', 'email');
    const details = getErrorDetails(error);
    
    expect(details.message).toBe('Validation error');
    expect(details.field).toBe('email');
  });

  it('deve extrair detalhes básicos de qualquer erro', () => {
    const error = new Error('Standard error');
    const details = getErrorDetails(error);
    
    expect(details.message).toBe('Standard error');
  });
});


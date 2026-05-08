import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { GeminiAPIError, OpenAIAPIError, WebhookError, getErrorMessage, getErrorDetails } from "./errors";
import { withRetry, RetryConfigs } from "./retry";
import type { LLMConfig } from "@/types/llm";

const N8N_WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL;
const N8N_WEBHOOK_SECRET = import.meta.env.VITE_N8N_WEBHOOK_SECRET as string | undefined;

if (!N8N_WEBHOOK_URL) {
  console.warn("⚠️ VITE_N8N_WEBHOOK_URL não está definida. O envio de mensagens pode falhar.");
}

export interface GenerateAIMessageResult {
  success: boolean;
  message: string;
  error?: string;
  errorCode?: string;
}

/** Usa apenas a configuração salva do usuário; não usa mais variável de ambiente. */
function getEffectiveConfig(config: LLMConfig | null): { provider: 'gemini' | 'openai'; apiKey: string; model: string } | null {
  if (config?.apiKey?.trim()) {
    return {
      provider: config.provider,
      apiKey: config.apiKey.trim(),
      model: config.model || (config.provider === 'openai' ? 'gpt-4o-mini' : 'gemini-2.5-flash'),
    };
  }
  return null;
}

export async function generateAIMessage(
  empresa: string,
  mensagemBase: string,
  userConfig: LLMConfig | null = null
): Promise<GenerateAIMessageResult> {
  const effective = getEffectiveConfig(userConfig);

  if (!effective) {
    const error = "Configure sua chave de API em Configurações de IA (Gemini ou ChatGPT).";
    console.warn(error);
    return {
      success: false,
      message: mensagemBase,
      error,
      errorCode: 'API_NOT_CONFIGURED'
    };
  }

  if (!mensagemBase || mensagemBase.trim().length === 0) {
    return {
      success: false,
      message: mensagemBase,
      error: 'Mensagem base não pode estar vazia',
      errorCode: 'EMPTY_MESSAGE'
    };
  }

  const prompt = `Modifique o texto abaixo, sem alterar a intenção ou significado da mensagem. Apenas faça pequenas variações nas palavras para evitar detecção de spam. Retorne APENAS o texto modificado, sem explicações.

Texto Original: ${mensagemBase}`;

  const retryResult = await withRetry(
    async () => {
      if (effective.provider === 'gemini') {
        const ai = new GoogleGenAI({ apiKey: effective.apiKey });
        const response = await ai.models.generateContent({
          model: effective.model,
          contents: prompt,
        });
        const generatedText = response.text;
        if (!generatedText || generatedText.trim().length === 0) {
          throw new GeminiAPIError("A API não retornou conteúdo válido");
        }
        return generatedText.trim();
      }

      const openai = new OpenAI({ apiKey: effective.apiKey, dangerouslyAllowBrowser: true });
      const completion = await openai.chat.completions.create({
        model: effective.model,
        messages: [{ role: 'user', content: prompt }],
      });
      const text = completion.choices[0]?.message?.content?.trim();
      if (!text) {
        throw new OpenAIAPIError("A API não retornou conteúdo válido");
      }
      return text;
    },
    {
      ...RetryConfigs.api,
      onRetry: (attempt, error) => {
        console.warn(`Tentativa ${attempt} de gerar mensagem IA falhou, tentando novamente...`, error);
      },
    }
  );

  if (retryResult.success && retryResult.data) {
    return { success: true, message: retryResult.data };
  }

  const error = retryResult.lastError;
  const errorDetails = getErrorDetails(error);
  console.error("API IA error após todas as tentativas:", errorDetails);

  let errorMessage = "Erro ao gerar mensagem com IA";
  let errorCode = "UNKNOWN_ERROR";

  if (error instanceof GeminiAPIError || error instanceof OpenAIAPIError) {
    errorMessage = error.message;
    errorCode = error.code;
  } else if (error instanceof Error) {
    if (error.message.includes('quota') || error.message.includes('limit')) {
      errorMessage = "Limite de requisições da API excedido. Tente novamente mais tarde.";
      errorCode = "API_QUOTA_EXCEEDED";
    } else if (error.message.includes('invalid') || error.message.includes('key') || error.message.includes('api_key')) {
      errorMessage = "Chave de API inválida. Verifique em Configurações de IA.";
      errorCode = "INVALID_API_KEY";
    } else if (error.message.includes('network') || error.message.includes('fetch')) {
      errorMessage = "Erro de conexão com a API. Verifique sua conexão com a internet.";
      errorCode = "NETWORK_ERROR";
    } else {
      errorMessage = `Erro na API: ${error.message}`;
    }
  }

  return {
    success: false,
    message: mensagemBase,
    error: errorMessage,
    errorCode
  };
}

export interface WebhookResult {
  success: boolean;
  error?: string;
  errorCode?: string;
  statusCode?: number;
}

/**
 * Envia mensagem para o serviço de disparo.
 * Cada usuário deve usar sua própria instância (Conector WhatsApp); o app só dispara quando há instância conectada.
 * @param instanceName - Nome da instância WhatsApp (Evolution) do usuário. Obrigatório.
 */
export async function sendToWebhook(
  empresa: string,
  telefone: string,
  mensagem: string,
  instanceName: string
): Promise<WebhookResult> {
  if (!N8N_WEBHOOK_URL) {
    const error = "URL de envio não configurada.";
    console.error(error);
    return { success: false, error, errorCode: 'WEBHOOK_NOT_CONFIGURED' };
  }

  if (!empresa || !telefone || !mensagem) {
    return {
      success: false,
      error: 'Parâmetros inválidos: empresa, telefone e mensagem são obrigatórios',
      errorCode: 'INVALID_PARAMETERS'
    };
  }

  if (!instanceName || !instanceName.trim()) {
    return {
      success: false,
      error: 'Conecte um WhatsApp no Conector WhatsApp para disparar.',
      errorCode: 'INSTANCE_REQUIRED'
    };
  }

  if (telefone.length < 12) {
    return {
      success: false,
      error: 'Telefone inválido. Deve conter pelo menos 12 dígitos (incluindo código do país)',
      errorCode: 'INVALID_PHONE'
    };
  }

  const retryResult = await withRetry(
    async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        const body = { Empresa: empresa, Telefone: telefone, Mensagem: mensagem, instanceName: instanceName.trim() };

        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (N8N_WEBHOOK_SECRET) headers["x-webhook-secret"] = N8N_WEBHOOK_SECRET;

        const response = await fetch(N8N_WEBHOOK_URL, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          let errorText = "Erro desconhecido";
          try { errorText = await response.text(); } catch { }
          const errCode = response.status === 400 ? 'BAD_REQUEST' : response.status === 401 || response.status === 403 ? 'UNAUTHORIZED' : response.status === 404 ? 'NOT_FOUND' : response.status === 429 ? 'RATE_LIMIT' : response.status >= 500 ? 'SERVER_ERROR' : 'WEBHOOK_ERROR';
          throw new WebhookError(
            response.status === 400 ? "Dados inválidos enviados ao webhook." :
            response.status === 401 || response.status === 403 ? "Não autorizado. Verifique as credenciais do webhook." :
            response.status === 404 ? "Webhook não encontrado. Verifique a URL configurada." :
            response.status === 429 ? "Muitas requisições. Aguarde um momento." :
            response.status >= 500 ? "Erro no servidor do webhook. Tente novamente mais tarde." : `Erro ao enviar mensagem (${response.status})`,
            response.status,
            response.statusText
          );
        }
        return { success: true as const };
      } catch (e) {
        clearTimeout(timeoutId);
        throw e;
      }
    },
    {
      ...RetryConfigs.api,
      retryableErrors: ['RATE_LIMIT', 'SERVER_ERROR', 'TIMEOUT', 'NETWORK_ERROR', 'CONNECTION_ERROR'],
      onRetry: (attempt, error) => {
        console.warn(`Tentativa ${attempt} de enviar webhook falhou, tentando novamente...`, error);
      },
    }
  );

  if (retryResult.success && retryResult.data) {
    return retryResult.data;
  }

  const error = retryResult.lastError;
  const errorDetails = getErrorDetails(error);
  console.error("Webhook error após todas as tentativas:", errorDetails);

  let errorMessage = "Erro ao enviar mensagem";
  let errorCode = "UNKNOWN_ERROR";
  let statusCode: number | undefined = undefined;

  if (error instanceof WebhookError) {
    errorMessage = error.message;
    errorCode = error.code;
    statusCode = error.statusCode;
  } else if (error instanceof Error) {
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      errorMessage = "Timeout ao enviar mensagem. O servidor demorou muito para responder.";
      errorCode = "TIMEOUT";
    } else if (error.message.includes('network') || error.message.includes('fetch')) {
      errorMessage = "Erro de conexão. Verifique sua conexão com a internet.";
      errorCode = "NETWORK_ERROR";
    } else if (error.message.includes('Failed to fetch')) {
      errorMessage = "Não foi possível conectar ao webhook. Verifique a URL configurada.";
      errorCode = "CONNECTION_ERROR";
    } else {
      errorMessage = `Erro ao enviar: ${error.message}`;
    }
  }

  return { success: false, error: errorMessage, errorCode, statusCode };
}

/** Intervalo mínimo permitido entre disparos (segundos). */
export const DISPATCH_DELAY_MIN_LIMIT = 2;
/** Intervalo máximo permitido entre disparos (segundos). */
export const DISPATCH_DELAY_MAX_LIMIT = 40;

/**
 * Retorna um número aleatório de segundos entre min e max (inclusive).
 * Usado como intervalo entre cada disparo bem-sucedido para evitar bloqueios.
 * @param minSeconds Mínimo em segundos (default DISPATCH_DELAY_MIN_LIMIT, ex. 2).
 * @param maxSeconds Máximo em segundos (default 25, não maior que DISPATCH_DELAY_MAX_LIMIT).
 */
export function getRandomDelay(
  minSeconds: number = DISPATCH_DELAY_MIN_LIMIT,
  maxSeconds: number = 25
): number {
  const min = Math.max(DISPATCH_DELAY_MIN_LIMIT, Math.min(minSeconds, DISPATCH_DELAY_MAX_LIMIT));
  const max = Math.max(DISPATCH_DELAY_MIN_LIMIT, Math.min(maxSeconds, DISPATCH_DELAY_MAX_LIMIT));
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

export function sleep(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

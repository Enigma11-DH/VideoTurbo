export interface ApiCallOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
  attempt?: number;
}

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public responseText?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true; // Timeout errors are retryable
  }
  
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true; // Network errors are retryable
  }
  
  if (error instanceof ApiError) {
    // Retry on server errors (5xx), but not on client errors (4xx)
    return error.statusCode >= 500;
  }
  
  return false;
}

export async function apiCall<T = any>(options: ApiCallOptions): Promise<ApiResponse<T>> {
  const {
    url,
    method = 'POST',
    headers = {},
    body,
    timeout = DEFAULT_TIMEOUT,
    retries = MAX_RETRIES,
    retryDelay = RETRY_DELAY,
    onRetry,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      console.log(`[API] Attempt ${attempt}/${retries + 1}: ${method} ${url}`);

      const fetchOptions: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...headers,
        },
      };

      if (body && method !== 'GET') {
        if (body instanceof FormData) {
          delete fetchOptions.headers['Content-Type']; // Let browser set boundary
          fetchOptions.body = body;
        } else {
          fetchOptions.body = JSON.stringify(body);
        }
      }

      const startTime = Date.now();
      
      const response = await fetchWithTimeout(url, fetchOptions, timeout);
      
      const duration = Date.now() - startTime;
      console.log(`[API] Response received in ${duration}ms - Status: ${response.status}`);

      const responseText = await response.text();
      
      console.log(`[API] Response size: ${responseText.length} bytes`);
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`[API] Response preview: ${responseText.substring(0, 200)}...`);
      }

      // Handle HTTP errors
      if (!response.ok) {
        let errorMessage: string;
        
        try {
          const errorData = JSON.parse(responseText);
          errorMessage = errorData.error || errorData.message || `HTTP ${response.status}`;
          
          // Add user-friendly messages for common status codes
          switch (response.status) {
            case 400:
              errorMessage = `请求参数错误: ${errorMessage}`;
              break;
            case 401:
              errorMessage = `认证失败，请检查 API Key 是否正确`;
              break;
            case 403:
              errorMessage = `访问被拒绝，权限不足`;
              break;
            case 404:
              errorMessage = `请求的资源不存在 (${url})`;
              break;
            case 429:
              errorMessage = `请求过于频繁，请稍后重试`;
              break;
            case 500:
            case 502:
            case 503:
              errorMessage = `服务器错误 (${response.status}): ${errorMessage}`;
              break;
            default:
              errorMessage = `HTTP ${response.status}: ${errorMessage}`;
          }
        } catch {
          errorMessage = `HTTP ${response.status}: ${responseText.substring(0, 200)}`;
        }

        throw new ApiError(errorMessage, response.status, responseText);
      }

      // Parse JSON response
      let data: T;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('[API] ❌ Failed to parse JSON:', parseError);
        console.error('[API] Raw response:', responseText.substring(0, 500));
        
        throw new Error(
          `服务器返回了无效的JSON格式。\n` +
          `状态码: ${response.status}\n` +
          `响应大小: ${responseText.length} bytes\n` +
          `原始响应预览: ${responseText.substring(0, 200)}...\n\n` +
          `这通常意味着后端处理过程中出现了异常。请查看浏览器控制台和终端日志获取详细信息。`
        );
      }

      console.log(`[API] ✅ Success on attempt ${attempt}`);
      
      return {
        success: true,
        data,
        statusCode: response.status,
        attempt,
      };

    } catch (error: any) {
      lastError = error;
      console.error(`[API] ❌ Attempt ${attempt} failed:`, error.message);

      // Check if we should retry
      if (attempt <= retries && isRetryableError(error)) {
        console.log(`[API] ⏳ Retrying in ${retryDelay * attempt}ms...`);
        
        if (onRetry) {
          onRetry(attempt, error);
        }
        
        // Exponential backoff with jitter
        const delay = retryDelay * attempt + Math.random() * 1000;
        await sleep(delay);
        continue;
      }

      // Don't retry non-retryable errors or if we've exhausted attempts
      break;
    }
  }

  // All attempts failed
  console.error(`[API] ❌ All ${retries + 1} attempts failed`);
  
  return {
    success: false,
    error: lastError?.message || 'Unknown error occurred',
    statusCode: lastError instanceof ApiError ? lastError.statusCode : undefined,
    attempt: retries + 1,
  };
}

// Specialized API functions for VideoTurbo

export async function submitAutoEditTask(params: {
  mediaFiles: File[];
  audioFile?: File | null;
  referenceUrl: string;
  aspectRatio: string;
  duration: number;
  template: string;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  onProgress?: (attempt: number, error: Error) => void;
}): Promise<ApiResponse<{ taskId: string }>> {
  const formData = new FormData();
  
  params.mediaFiles.forEach((f) => formData.append("videos", f));
  if (params.audioFile) formData.append("audio", params.audioFile);
  formData.append("url", params.referenceUrl.trim());
  formData.append("aspectRatio", params.aspectRatio);
  formData.append("duration", String(params.duration));
  formData.append("template", params.template);
  formData.append("llmBaseUrl", params.llmBaseUrl);
  formData.append("llmApiKey", params.llmApiKey);
  formData.append("llmModel", params.llmModel);

  console.log('[Submit] 📤 Sending auto-edit task...');
  console.log('[Submit] Files:', params.mediaFiles.length, 'videos,', params.audioFile ? '1 audio' : 'no audio');
  console.log('[Submit] Config:', { 
    aspectRatio: params.aspectRatio, 
    duration: params.duration, 
    template: params.template 
  });
  console.log('[Submit] LLM:', { 
    baseUrl: params.llmBaseUrl, 
    model: params.llmModel,
    hasKey: !!params.llmApiKey 
  });

  return apiCall<{ taskId: string }>({
    url: '/api/auto-edit',
    method: 'POST',
    body: formData,
    timeout: 60000, // 60 seconds for file upload
    retries: 2,
    retryDelay: 2000,
    onRetry: params.onProgress,
  });
}

export async function testLlmConnection(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
}): Promise<ApiResponse<{
  success: boolean;
  model: string;
  provider: string;
  responsePreview?: string;
  message?: string;
}>> {
  console.log('[TestLLM] 🔍 Testing connection to:', params.baseUrl);
  console.log('[TestLLM] Model:', params.model);

  return apiCall({
    url: '/api/test-llm',
    method: 'POST',
    body: {
      baseUrl: params.baseUrl,
      apiKey: params.apiKey,
      model: params.model,
    },
    timeout: 15000, // 15 seconds
    retries: 1,
    retryDelay: 1000,
  });
}

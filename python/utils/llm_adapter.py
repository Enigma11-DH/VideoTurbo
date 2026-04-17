"""
Universal LLM Adapter — OpenAI-compatible REST interface.

Supports any provider that implements POST /chat/completions with
  Authorization: Bearer {api_key}

Built-in presets (base_url + default model):
  zhipu   : https://open.bigmodel.cn/api/paas/v4                   / glm-4-flash
  wenxin  : https://qianfan.baidubce.com/v2                           / ernie-4.5-8k
  qianwen : https://dashscope.aliyuncs.com/compatible-mode/v1         / qwen-turbo
  openai  : https://api.openai.com/v1                                  / gpt-4o-mini
  deepseek: https://api.deepseek.com/v1                                / deepseek-chat

Enhanced Features:
- Detailed logging for debugging JSON parse issues
- Response validation and error reporting
- Raw response preservation for troubleshooting
"""
import json
import logging
import urllib.request
import urllib.error
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

PRESETS: Dict[str, Dict[str, str]] = {
    "zhipu": {
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "default_model": "glm-4-flash",
    },
    "doubao": {
        "base_url": "https://ark.cn-beijing.volces.com/api/v3",
        "default_model": "doubao-pro-32k",
    },
    "wenxin": {
        "base_url": "https://qianfan.baidubce.com/v2",
        "default_model": "ernie-4.5-8k",
    },
    "qianwen": {
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "default_model": "qwen-turbo",
    },
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "default_model": "gpt-4o-mini",
    },
    "deepseek": {
        "base_url": "https://api.deepseek.com/v1",
        "default_model": "deepseek-chat",
    },
}


class LLMAdapter:
    """
    Minimal OpenAI-compatible chat adapter.

    Usage:
        adapter = LLMAdapter(
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
            api_key="sk-xxx",
            model="qwen-turbo",
        )
        reply = adapter.chat([{"role": "user", "content": "Hello"}])
    """

    def __init__(self, base_url: str, api_key: str, model: str):
        if not base_url:
            raise ValueError("base_url is required")
        if not api_key:
            raise ValueError("api_key is required")
        if not model:
            raise ValueError("model is required")

        self.base_url = base_url.rstrip("/")
        self.url = f"{self.base_url}/chat/completions"
        self.api_key = api_key
        self.model = model

        logger.info(f"[LLM] Initialized adapter")
        logger.debug(f"[LLM] Base URL: {self.base_url}")
        logger.debug(f"[LLM] Model: {self.model}")
        logger.debug(f"[LLM] API Key (masked): {api_key[:8]}...{api_key[-4:]}" if len(api_key) > 12 else "[LLM] API Key configured")

    def chat(
        self,
        messages: list,
        temperature: float = 0.7,
        max_tokens: int = 4096,
    ) -> str:
        """
        Send a chat request and return the assistant message content as a string.
        Raises RuntimeError on HTTP / parsing errors.
        """
        request_body = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        body_json = json.dumps(request_body).encode("utf-8")

        logger.info(f"[LLM] Sending request to {self.model}")
        logger.debug(f"[LLM] Request body size: {len(body_json)} bytes")
        logger.debug(f"[LLM] Messages count: {len(messages)}")

        req = urllib.request.Request(
            self.url,
            data=body_json,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )

        try:
            logger.debug(f"[LLM] Connecting to {self.url}...")
            with urllib.request.urlopen(req, timeout=120) as resp:
                raw_response = resp.read()
                status_code = resp.status
                logger.info(f"[LLM] Response received - Status: {status_code}, Size: {len(raw_response)} bytes")

                try:
                    data = json.loads(raw_response.decode("utf-8"))
                    logger.debug(f"[LLM] Response parsed successfully")
                except json.JSONDecodeError as e:
                    logger.error(f"[LLM] Failed to parse response as JSON!")
                    logger.error(f"[LLM] JSON Error: {e}")
                    logger.error(f"[LLM] Raw response (first 500 chars): {raw_response[:500].decode('utf-8', errors='replace')}")
                    raise RuntimeError(
                        f"Response is not valid JSON. "
                        f"Status: {status_code}, Size: {len(raw_response)} bytes. "
                        f"Error: {e}. "
                        f"Raw preview: {raw_response[:200].decode('utf-8', errors='replace')}"
                    ) from e

        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8", errors="replace")
            logger.error(f"[LLM] HTTP Error: {e.code} {e.reason}")
            logger.error(f"[LLM] Error body: {error_body[:500]}")
            raise RuntimeError(
                f"LLM request failed [{e.code}]: {error_body[:500]}"
            ) from e
        except urllib.error.URLError as e:
            logger.error(f"[LLM] URL/Network Error: {e.reason}")
            raise RuntimeError(
                f"Cannot connect to LLM server at {self.base_url}. "
                f"Error: {e.reason}. "
                f"Please check your network connection and API base URL."
            ) from e
        except Exception as e:
            logger.error(f"[LLM] Unexpected error during request: {type(e).__name__}: {e}")
            raise RuntimeError(f"LLM request error: {e}") from e

        # Validate and extract message content
        try:
            choices = data.get("choices", [])
            if not choices:
                logger.warning("[LLM] No 'choices' in response")
                logger.debug(f"[LLM] Full response structure: {list(data.keys())}")

                # Check for common error structures
                if "error" in data:
                    error_info = data["error"]
                    error_msg = error_info.get("message", str(error_info))
                    error_code = error_info.get("code", "unknown")
                    logger.error(f"[LLM] API returned error: [{error_code}] {error_msg}")
                    raise RuntimeError(
                        f"LLM API returned error: [{error_code}] {error_msg}"
                    )

                raise RuntimeError(
                    f"No choices in LLM response. "
                    f"Available keys: {list(data.keys())}. "
                    f"Full response preview: {str(data)[:300]}"
                )

            first_choice = choices[0]
            message = first_choice.get("message", {})

            if "content" not in message:
                logger.warning("[LLM] Message has no 'content' field")
                logger.debug(f"[LLM] Message keys: {list(message.keys())}")
                logger.debug(f"[LLM] Full choice: {str(first_choice)[:300]}")

                # Some APIs might use different field names
                for field in ["text", "result", "output"]:
                    if field in message:
                        logger.info(f"[LLM] Using alternative field '{field}' instead of 'content'")
                        return str(message[field])

                raise RuntimeError(
                    f"Message missing 'content' field. "
                    f"Message keys: {list(message.keys())}"
                )

            content = message["content"]

            if not isinstance(content, str):
                logger.warning(f"[LLM] Content is not string: {type(content).__name__}")
                content = str(content)

            logger.info(f"[LLM] Successfully extracted content ({len(content)} chars)")
            logger.debug(f"[LLM] Content preview: {content[:200]}...")

            return content

        except (KeyError, IndexError) as e:
            logger.error(f"[LLM] Unexpected response structure: {e}")
            logger.error(f"[LLM] Data type: {type(data)}")
            logger.error(f"[LLM] Data preview: {str(data)[:300]}")
            raise RuntimeError(
                f"Unexpected LLM response structure: {str(data)[:300]}"
            ) from e


def adapter_from_payload(payload: dict) -> "LLMAdapter":
    """
    Convenience factory: build an LLMAdapter from pipeline task payload.
    Expects keys: llmBaseUrl, llmApiKey, llmModel.
    """
    base_url = payload.get("llmBaseUrl", "")
    api_key  = payload.get("llmApiKey", "")
    model    = payload.get("llmModel", "")

    logger.info(f"[LLM Factory] Building adapter from payload")
    logger.debug(f"[LLM Factory] Keys present: {list(payload.keys())}")

    if not base_url or not api_key or not model:
        missing = []
        if not base_url: missing.append("llmBaseUrl")
        if not api_key: missing.append("llmApiKey")
        if not model: missing.append("llmModel")

        logger.error(f"[LLM Factory] Missing required fields: {', '.join(missing)}")
        raise ValueError(
            f"Pipeline payload must contain {', '.join(missing)}. "
            "Please configure a model in Settings."
        )

    return LLMAdapter(base_url=base_url, api_key=api_key, model=model)

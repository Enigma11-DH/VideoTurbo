"""
Universal LLM Adapter — OpenAI-compatible REST interface.

Supports any provider that implements POST /chat/completions with
  Authorization: Bearer {api_key}

Built-in presets (base_url + default model):
  wenxin  : https://qianfan.baidubce.com/v2                           / ernie-4.5-8k
  qianwen : https://dashscope.aliyuncs.com/compatible-mode/v1         / qwen-turbo
  openai  : https://api.openai.com/v1                                  / gpt-4o-mini
  deepseek: https://api.deepseek.com/v1                                / deepseek-chat
"""
import json
import urllib.request
import urllib.error

PRESETS: dict = {
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
        self.url = base_url.rstrip("/") + "/chat/completions"
        self.api_key = api_key
        self.model = model

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
        body = json.dumps(
            {
                "model": self.model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
        ).encode("utf-8")

        req = urllib.request.Request(
            self.url,
            data=body,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
        )

        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(
                f"LLM request failed [{e.code}]: {error_body[:500]}"
            ) from e
        except Exception as e:
            raise RuntimeError(f"LLM request error: {e}") from e

        try:
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as e:
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

    if not base_url or not api_key or not model:
        raise ValueError(
            "Pipeline payload must contain llmBaseUrl, llmApiKey, llmModel. "
            "Please configure a model in Settings."
        )

    return LLMAdapter(base_url=base_url, api_key=api_key, model=model)

"""
Robust JSON Parser for LLM Responses

Handles various formats returned by different LLM providers:
- Pure JSON: {...} or [...]
- Markdown code blocks: ```json ... ``` or ``` ... ```
- Mixed format: Text before/after JSON
- Truncated JSON (incomplete)
- Malformed JSON (common errors auto-fixed)

Features:
- Multi-level extraction strategies
- Detailed logging for debugging
- Auto-repair of common issues
- Original response preservation
"""
import json
import re
import logging
from typing import Any, Optional, Tuple

logger = logging.getLogger(__name__)


def extract_json_from_llm_response(
    raw_response: str,
    save_raw_to_file: Optional[str] = None,
    expected_type: str = "array"  # "array" or "object"
) -> Tuple[Optional[Any], dict]:
    """
    Extract and parse JSON from LLM response with multiple fallback strategies.

    Args:
        raw_response: Raw text response from LLM
        save_raw_to_file: If provided, save raw response to this file for debugging
        expected_type: Expected JSON type ("array" or "object")

    Returns:
        Tuple of (parsed_json_or_none, diagnostic_info)
        diagnostic_info contains details about parsing attempts and errors
    """
    diagnostic = {
        "raw_length": len(raw_response),
        "raw_preview": raw_response[:200] if raw_response else "",
        "attempts": [],
        "success": False,
        "error": None,
        "method_used": None,
    }

    if not raw_response or not raw_response.strip():
        diagnostic["error"] = "Empty response"
        logger.error("[JSON Parser] Empty response received")
        return None, diagnostic

    # Save raw response for debugging if requested
    if save_raw_to_file:
        try:
            with open(save_raw_to_file, 'w', encoding='utf-8') as f:
                f.write(raw_response)
            logger.info(f"[JSON Parser] Raw response saved to {save_raw_to_file}")
        except Exception as e:
            logger.warning(f"[JSON Parser] Failed to save raw response: {e}")

    # Strategy 1: Direct parse (purest form)
    result = _try_direct_parse(raw_response, expected_type, diagnostic)
    if result is not None:
        diagnostic["success"] = True
        diagnostic["method_used"] = "direct_parse"
        return result, diagnostic

    # Strategy 2: Strip markdown code blocks (```json ... ```)
    result = _try_strip_markdown_blocks(raw_response, expected_type, diagnostic)
    if result is not None:
        diagnostic["success"] = True
        diagnostic["method_used"] = "markdown_strip"
        return result, diagnostic

    # Strategy 3: Find JSON pattern using regex
    result = _find_json_pattern(raw_response, expected_type, diagnostic)
    if result is not None:
        diagnostic["success"] = True
        diagnostic["method_used"] = "regex_extraction"
        return result, diagnostic

    # Strategy 4: Try to repair common JSON errors
    result = _try_repair_and_parse(raw_response, expected_type, diagnostic)
    if result is not None:
        diagnostic["success"] = True
        diagnostic["method_used"] = "repair"
        return result, diagnostic

    # All strategies failed
    logger.error(f"[JSON Parser] All parsing strategies failed. Diagnostic: {diagnostic}")
    return None, diagnostic


def _try_direct_parse(text: str, expected_type: str, diagnostic: dict) -> Optional[Any]:
    """Strategy 1: Try parsing the text as-is."""
    try:
        data = json.loads(text)
        if _validate_type(data, expected_type):
            diagnostic["attempts"].append({"method": "direct", "status": "success"})
            return data
        else:
            diagnostic["attempts"].append({
                "method": "direct",
                "status": "wrong_type",
                "actual_type": type(data).__name__
            })
    except json.JSONDecodeError as e:
        diagnostic["attempts"].append({
            "method": "direct",
            "status": "json_error",
            "error": str(e),
            "line": e.lineno,
            "column": e.colno,
            "message": e.msg
        })
    return None


def _try_strip_markdown_blocks(text: str, expected_type: str, diagnostic: dict) -> Optional[Any]:
    """Strategy 2: Remove markdown code fences."""
    cleaned = text.strip()

    patterns = [
        r'```(?:json)?\s*\n?(.*?)\n?```',  # ```json ... ``` or ``` ... ```
        r'```\s*(.*?)\s*```',                 # ``` ... ```
    ]

    for pattern in patterns:
        matches = re.findall(pattern, cleaned, re.DOTALL)
        for match in matches:
            try:
                data = json.loads(match.strip())
                if _validate_type(data, expected_type):
                    diagnostic["attempts"].append({
                        "method": "markdown_strip",
                        "pattern": pattern,
                        "status": "success"
                    })
                    return data
            except json.JSONDecodeError as e:
                diagnostic["attempts"].append({
                    "method": "markdown_strip",
                    "pattern": pattern,
                    "status": "json_error",
                    "error": str(e)
                })

    return None


def _find_json_pattern(text: str, expected_type: str, diagnostic: dict) -> Optional[Any]:
    """Strategy 3: Use regex to find JSON-like structures."""

    if expected_type == "array":
        # Find arrays [...]
        patterns = [
            r'\[[\s\S]*?\]',           # Simple array
            r'(\[[^\[\]]*(?:\[[^\[\]]*\][^\[\]]*)*\])',  # Nested array
        ]
    else:
        # Find objects {...}
        patterns = [
            r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}',  # Simple object
        ]

    for pattern in patterns:
        matches = re.findall(pattern, text)
        for match in reversed(matches):  # Try from end (often the actual JSON)
            try:
                data = json.loads(match)
                if _validate_type(data, expected_type):
                    diagnostic["attempts"].append({
                        "method": "regex_find",
                        "pattern": pattern,
                        "match_length": len(match),
                        "status": "success"
                    })
                    return data
            except json.JSONDecodeError as e:
                diagnostic["attempts"].append({
                    "method": "regex_find",
                    "pattern": pattern,
                    "status": "json_error",
                    "error": str(e)
                })

    return None


def _try_repair_and_parse(text: str, expected_type: str, diagnostic: dict) -> Optional[Any]:
    """Strategy 4: Attempt to repair common JSON issues."""

    repair_attempts = [
        ("strip_explanatory_text", _repair_strip_explanatory_text),
        ("fix_trailing_commas", _repair_fix_trailing_commas),
        ("fix_unquoted_keys", _repair_fix_unquoted_keys),
        ("fix_single_quotes", _repair_fix_single_quotes),
        ("fix_comments", _repair_remove_comments),
        ("extract_from_text", _repair_extract_json_from_text),
    ]

    for repair_name, repair_func in repair_attempts:
        try:
            repaired = repair_func(text)
            if repaired != text:  # Only try if repair changed something
                data = json.loads(repaired)
                if _validate_type(data, expected_type):
                    diagnostic["attempts"].append({
                        "method": f"repair_{repair_name}",
                        "status": "success"
                    })
                    return data
        except (json.JSONDecodeError, Exception) as e:
            diagnostic["attempts"].append({
                "method": f"repair_{repair_name}",
                "status": "failed",
                "error": str(e)[:200]
            })

    return None


# ---------- Repair Functions ----------

def _repair_strip_explanatory_text(text: str) -> str:
    """Remove common explanatory text before/after JSON."""
    lines = text.split('\n')

    start_idx = 0
    end_idx = len(lines)

    # Find first line that looks like JSON start
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith(('{', '[')):
            start_idx = i
            break

    # Find last line that looks like JSON end
    for i in range(len(lines) - 1, -1, -1):
        stripped = lines[i].strip()
        if stripped.endswith(('}', ']')):
            end_idx = i + 1
            break

    return '\n'.join(lines[start_idx:end_idx])


def _repair_fix_trailing_commas(text: str) -> str:
    """Remove trailing commas before } or ]."""
    text = re.sub(r',(\s*[}\]])', r'\1', text)
    return text


def _repair_fix_unquoted_keys(text: str) -> str:
    """Add quotes around unquoted object keys."""
    def add_quotes(match):
        key = match.group(1)
        return f'"{key}"'

    text = re.sub(r'(\w+)\s*:', add_quotes, text)
    return text


def _repair_fix_single_quotes(text: str) -> str:
    """Replace single quotes with double quotes (careful with contractions)."""
    # Only replace single quotes that look like string delimiters
    text = re.sub(r"'([^']*)'", r'"\1"', text)
    return text


def _repair_remove_comments(text: str) -> str:
    """Remove JavaScript-style comments."""
    text = re.sub(r'//.*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
    return text


def _repair_extract_json_from_text(text: str) -> str:
    """Last resort: find anything between outermost brackets."""
    if '[' in text and ']' in text:
        start = text.index('[')
        end = text.rindex(']') + 1
        return text[start:end]
    elif '{' in text and '}' in text:
        start = text.index('{')
        end = text.rindex('}') + 1
        return text[start:end]
    return text


# ---------- Validation ----------

def _validate_type(data: Any, expected_type: str) -> bool:
    """Validate that parsed data matches expected type."""
    if expected_type == "array":
        return isinstance(data, list)
    elif expected_type == "object":
        return isinstance(data, dict)
    else:
        return True  # Accept any type if not specified


def safe_parse_json_array(raw_response: str, context: str = "") -> list:
    """
    Convenience function: Parse LLM response expecting a JSON array.
    Returns empty list on failure with detailed logging.

    Args:
        raw_response: Raw LLM response text
        context: Additional context for error messages (e.g., task ID)

    Returns:
        Parsed list or empty list if parsing fails
    """
    if not raw_response:
        logger.warning(f"[{context}] Empty response, returning empty array")
        return []

    parsed, diagnostic = extract_json_from_llm_response(
        raw_response,
        expected_type="array"
    )

    if parsed is not None:
        logger.info(f"[{context}] Successfully parsed JSON array with {len(parsed)} items")
        logger.debug(f"[{context}] Method used: {diagnostic['method_used']}")
        return parsed if isinstance(parsed, list) else [parsed]

    # Log detailed failure information
    logger.error(f"""
[{context}] JSON PARSE FAILURE DIAGNOSTIC
{'='*60}
Raw Response Length: {diagnostic['raw_length']} chars
Raw Preview: {diagnostic['raw_preview']}
{'='*60}
Parsing Attempts:""")

    for attempt in diagnostic['attempts']:
        logger.error(f"  - Method: {attempt.get('method')}")
        logger.error(f"    Status: {attempt.get('status')}")
        if 'error' in attempt:
            logger.error(f"    Error: {attempt.get('error')}")

    logger.error(f"""
{'='*60}
Final Error: {diagnostic.get('error', 'All strategies exhausted')}
{'='*60}
""")

    return []


if __name__ == "__main__":
    # Test cases
    test_cases = [
        ('[{"a": 1}, {"b": 2}]', "Pure JSON array"),
        ('```json\n[{"a": 1}]\n```', "Markdown block"),
        ('Here is the result:\n[{"x": 1}]\nHope this helps!', "Mixed text"),
        ('[{"key": "value", },]', "Trailing comma"),
    ]

    print("Testing JSON Parser:")
    print("=" * 60)

    for test_input, description in test_cases:
        print(f"\nTest: {description}")
        print(f"Input: {test_input[:50]}...")

        result, diag = extract_json_from_llm_response(test_input, expected_type="array")
        print(f"Success: {diag['success']}")
        print(f"Method: {diag.get('method_used', 'N/A')}")
        print(f"Result: {result}")

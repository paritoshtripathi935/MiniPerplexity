from dataclasses import dataclass
from typing import AsyncIterator, Optional, List, Dict
from enum import Enum
import json
import logging
import re
import httpx
import requests

from app.core.config import config as _cfg

logger = logging.getLogger(__name__)


class CloudflareAPIError(Exception):
    pass

class ConfigurationError(Exception):
    pass

BASE_URL = "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/"
SYSTEM_PROMPT: str = _cfg.prompts.search_context

DEFAULT_MAX_TOKENS = 4096
SHORT_CALL_MAX_TOKENS = 512

_all_slugs = [m.id for m in _cfg.models.models] + _cfg.models.legacy_slugs
CloudflareModel = Enum(  # type: ignore[misc]
    "CloudflareModel",
    {slug.split("/")[-1].upper().replace("-", "_"): slug for slug in _all_slugs},
    type=str,
)

DEFAULT_CHAT_MODEL = CloudflareModel(_cfg.models.defaults.chat)
DEFAULT_RERANK_MODEL = CloudflareModel(_cfg.models.defaults.rerank)
DEFAULT_NEXT_STEPS_MODEL = CloudflareModel(_cfg.models.defaults.next_steps)


@dataclass(frozen=True)
class ChatModelOption:
    id: str
    label: str
    description: str
    recommended: bool = False


CHAT_MODEL_CATALOG: List[ChatModelOption] = [
    ChatModelOption(id=m.id, label=m.label, description=m.description, recommended=m.recommended)
    for m in _cfg.models.models
]

_CHAT_MODEL_IDS = {opt.id for opt in CHAT_MODEL_CATALOG}


def is_valid_chat_model(slug: Optional[str]) -> bool:
    return isinstance(slug, str) and slug in _CHAT_MODEL_IDS


def resolve_chat_model(slug: Optional[str]) -> CloudflareModel:
    if slug:
        for m in CloudflareModel:
            if m.value == slug:
                return m
    return DEFAULT_CHAT_MODEL


def _coerce_token(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(value)
    return ""


def _extract_stream_delta(chunk: Dict) -> str:
    if not isinstance(chunk, dict):
        return ""
    if "response" in chunk:
        return _coerce_token(chunk.get("response"))
    choices = chunk.get("choices")
    if isinstance(choices, list) and choices:
        delta = choices[0].get("delta") if isinstance(choices[0], dict) else None
        if isinstance(delta, dict):
            return _coerce_token(delta.get("content"))
    return ""


def _extract_response_text(payload: Dict) -> str:
    if not isinstance(payload, dict):
        return ""
    result = payload.get("result")
    if not isinstance(result, dict):
        return ""
    if "response" in result:
        return _coerce_token(result.get("response"))
    choices = result.get("choices")
    if isinstance(choices, list) and choices:
        message = choices[0].get("message") if isinstance(choices[0], dict) else None
        if isinstance(message, dict):
            return _coerce_token(message.get("content"))
    return ""


class CloudflareChat:

    def __init__(
        self,
        api_key: str,
        account_id: str,
        model: CloudflareModel = DEFAULT_CHAT_MODEL,
    ) -> None:
        if not api_key or not account_id:
            raise ConfigurationError("api_key and account_id must be specified")
        if not isinstance(model, CloudflareModel):
            raise ConfigurationError(
                f"Invalid model specified. Choose from: {', '.join(CloudflareModel.list_models())}"
            )
        self.api_key = api_key
        self.account_id = account_id
        self.model = model

    @property
    def full_url(self) -> str:
        return self._url_for(self.model)

    def _url_for(self, model: CloudflareModel) -> str:
        return f"{BASE_URL.format(account_id=self.account_id)}{model.value}"

    def _get_headers(self) -> Dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}"}

    def _format_context(self, search_results: List[Dict]) -> str:
        parts: List[str] = []
        for idx, result in enumerate(search_results, start=1):
            title = (result.get("title") or "").strip()
            url = (result.get("url") or "").strip()
            content = (result.get("search_content") or result.get("snippet") or "").strip()
            header_bits: List[str] = [f"[{idx}]"]
            if title:
                header_bits.append(title)
            if url:
                header_bits.append(f"({url})")
            header = " ".join(header_bits)
            parts.append(f"{header}\n{content}" if content else header)
        return "\n\n".join(parts)

    def _call_for_prompt(
        self,
        messages: List[Dict[str, str]],
        max_tokens: int = DEFAULT_MAX_TOKENS,
        model: Optional[CloudflareModel] = None,
    ) -> Dict:
        # Local import avoids startup-time circular dependency.
        from app.services.image_gen import is_quota_error, text_credential_pool

        chosen_model = model if model is not None else self.model
        pool = text_credential_pool(self.account_id, self.api_key)
        if not pool:
            raise CloudflareAPIError("no cloudflare credentials configured for text generation")

        body = {"messages": messages, "max_tokens": max_tokens}
        last_error: Optional[Exception] = None

        for slot_index, (account_id, api_key) in enumerate(pool, start=1):
            url = BASE_URL.format(account_id=account_id) + chosen_model.value
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            try:
                response = requests.post(url, headers=headers, json=body)
            except requests.exceptions.RequestException as e:
                logger.warning("chat slot %d/%d transport error: %s — trying next slot", slot_index, len(pool), e)
                last_error = CloudflareAPIError(f"API call failed: {e}")
                continue

            if response.status_code >= 400:
                body_text = response.text or ""
                if is_quota_error(response.status_code, body_text):
                    logger.warning(
                        "chat slot %d/%d quota/auth (%s) — trying next slot. body=%s",
                        slot_index, len(pool), response.status_code, body_text[:300],
                    )
                    last_error = CloudflareAPIError(f"Cloudflare returned {response.status_code}: {body_text[:300]}")
                    continue
                raise CloudflareAPIError(f"API call failed ({response.status_code}): {body_text[:500]}")

            if slot_index > 1:
                logger.info("chat succeeded on slot %d/%d (%d exhausted)", slot_index, len(pool), slot_index - 1)
            return response.json()

        raise last_error or CloudflareAPIError("all cloudflare text-credential slots exhausted")

    def _build_answer_messages(
        self,
        search_results: List[Dict],
        chat_history: Optional[List[Dict]],
        query: Optional[str],
        previous_queries: Optional[List[str]],
        system_override: Optional[str],
    ) -> List[Dict[str, str]]:
        if system_override:
            system_content = system_override
            if search_results:
                system_content += "\n\n## Sources for this turn\n\n" + self._format_context(search_results)
        elif search_results:
            system_content = SYSTEM_PROMPT.format(context=self._format_context(search_results))
        else:
            system_content = _cfg.prompts.generic_assistant

        messages: List[Dict[str, str]] = [{"role": "system", "content": system_content}]
        if chat_history:
            messages.extend(chat_history)
        if previous_queries:
            query = (
                f"Previous questions in this conversation: {' | '.join(previous_queries)}\n\n"
                f"Current question: {query}"
            )
        if query:
            messages.append({"role": "user", "content": query})
        return messages

    def generate_answer(
        self,
        search_results: List[Dict],
        chat_history: Optional[List[Dict]] = None,
        query: Optional[str] = None,
        previous_queries: Optional[List[str]] = None,
        system_override: Optional[str] = None,
        model: Optional[CloudflareModel] = None,
    ) -> str:
        formatted = self._build_answer_messages(
            search_results, chat_history, query, previous_queries, system_override
        )
        response = self._call_for_prompt(formatted, model=model)
        return _extract_response_text(response)

    async def stream_answer(
        self,
        search_results: List[Dict],
        chat_history: Optional[List[Dict]] = None,
        query: Optional[str] = None,
        previous_queries: Optional[List[str]] = None,
        system_override: Optional[str] = None,
        model: Optional[CloudflareModel] = None,
        max_tokens: int = DEFAULT_MAX_TOKENS,
    ) -> AsyncIterator[str]:
        from app.services.image_gen import is_quota_error, text_credential_pool

        formatted = self._build_answer_messages(
            search_results, chat_history, query, previous_queries, system_override
        )
        chosen_model = model if model is not None else self.model
        pool = text_credential_pool(self.account_id, self.api_key)
        if not pool:
            raise CloudflareAPIError("no cloudflare credentials configured for text streaming")

        payload = {"messages": formatted, "max_tokens": max_tokens, "stream": True}
        timeout = httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=10.0)
        last_error: Optional[Exception] = None

        for slot_index, (account_id, api_key) in enumerate(pool, start=1):
            url = BASE_URL.format(account_id=account_id) + chosen_model.value
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    async with client.stream("POST", url, headers=headers, json=payload) as response:
                        if response.status_code >= 400:
                            body = await response.aread()
                            body_text = body.decode("utf-8", errors="replace")[:500]
                            if is_quota_error(response.status_code, body_text):
                                logger.warning(
                                    "stream slot %d/%d quota/auth (%s) — trying next. body=%s",
                                    slot_index, len(pool), response.status_code, body_text[:300],
                                )
                                last_error = CloudflareAPIError(f"Streaming call failed ({response.status_code}): {body_text}")
                                continue
                            raise CloudflareAPIError(f"Streaming call failed ({response.status_code}): {body_text}")

                        if slot_index > 1:
                            logger.info("stream succeeded on slot %d/%d (%d exhausted)", slot_index, len(pool), slot_index - 1)

                        async for line in response.aiter_lines():
                            if not line or not line.startswith("data:"):
                                continue
                            data = line[5:].strip()
                            if not data:
                                continue
                            if data == "[DONE]":
                                return
                            try:
                                chunk = json.loads(data)
                            except json.JSONDecodeError:
                                continue
                            delta = _extract_stream_delta(chunk)
                            if delta:
                                yield delta
                        return
            except httpx.HTTPError as e:
                logger.warning("stream slot %d/%d transport error: %s — trying next", slot_index, len(pool), e)
                last_error = CloudflareAPIError(f"Streaming transport error: {e}")
                continue

        raise last_error or CloudflareAPIError("all cloudflare text-credential slots exhausted")

    def score_search_results(self, query: str, results: List[Dict]) -> Dict[int, int]:
        if not results:
            return {}
        capped = list(results)[:20]
        items_text = "\n".join(
            f"[{i + 1}] {(r.get('title') or '').strip()} — {(r.get('url') or '').strip()}\n"
            f"    {(r.get('snippet') or '').strip()[:200]}"
            for i, r in enumerate(capped)
        )
        try:
            response = self._call_for_prompt(
                [
                    {"role": "system", "content": _cfg.prompts.rerank_system},
                    {"role": "user", "content": _cfg.prompts.rerank_user.format(
                        query=query.strip()[:300], items=items_text
                    )},
                ],
                max_tokens=SHORT_CALL_MAX_TOKENS,
                model=DEFAULT_RERANK_MODEL,
            )
            raw = _extract_response_text(response)
        except CloudflareAPIError:
            return {}

        scores: Dict[int, int] = {}
        line_re = re.compile(r"\[?\s*(\d+)\s*\]?\s*[:=]\s*(\d+)")
        for line in (raw or "").splitlines():
            m = line_re.search(line)
            if not m:
                continue
            idx, score = int(m.group(1)) - 1, int(m.group(2))
            if 0 <= idx < len(capped) and 0 <= score <= 100:
                scores[idx] = score
        return scores

    def generate_next_steps(self, user_query: str, assistant_answer: str) -> List[str]:
        ans = (assistant_answer or "").strip()[:1500]
        q = (user_query or "").strip()[:400]
        try:
            response = self._call_for_prompt(
                [
                    {"role": "system", "content": _cfg.prompts.next_steps},
                    {"role": "user", "content": _cfg.prompts.next_steps_user.format(query=q, answer=ans)},
                ],
                max_tokens=SHORT_CALL_MAX_TOKENS,
                model=DEFAULT_NEXT_STEPS_MODEL,
            )
            raw = _extract_response_text(response)
        except CloudflareAPIError:
            return []

        cleaned: List[str] = []
        for line in (raw or "").splitlines():
            stripped = line.strip().lstrip("-*•0123456789.) \"'").strip().strip('"').strip()
            if 6 <= len(stripped) <= 200:
                cleaned.append(stripped)
            if len(cleaned) == 3:
                break
        return cleaned

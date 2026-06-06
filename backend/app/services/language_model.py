from dataclasses import dataclass
from typing import AsyncIterator, Optional, List, Dict
from enum import Enum
import json
import re
import httpx
import requests

from app.core.config import config as _cfg

# Custom exceptions
class CloudflareAPIError(Exception):
    """Raised when Cloudflare API returns an error"""
    pass

class ConfigurationError(Exception):
    """Raised when there's an issue with configuration"""
    pass

# Constants
BASE_URL = "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/"
SYSTEM_PROMPT: str = _cfg.prompts.search_context

# Cloudflare Workers AI defaults `max_tokens` to 256 for chat models, which
# truncates real marketing answers (a channel plan or weekly review easily
# wants 800–2000 tokens). Lift the cap so the model can finish its thought.
DEFAULT_MAX_TOKENS = 4096
# Tighter cap for short structured calls (next-step suggestions, scoring).
SHORT_CALL_MAX_TOKENS = 512


# Build the enum dynamically from config so adding a model is a YAML-only change.
# All selectable slugs + legacy slugs (for back-compat) are included.
_all_slugs = (
    [m.id for m in _cfg.models.models] + _cfg.models.legacy_slugs
)
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


# Built from config — add/remove models in config/models.yaml.
CHAT_MODEL_CATALOG: List[ChatModelOption] = [
    ChatModelOption(id=m.id, label=m.label, description=m.description, recommended=m.recommended)
    for m in _cfg.models.models
]

_CHAT_MODEL_IDS = {opt.id for opt in CHAT_MODEL_CATALOG}


def is_valid_chat_model(slug: Optional[str]) -> bool:
    """Whitelist check before persisting a user's preferred_chat_model."""
    return isinstance(slug, str) and slug in _CHAT_MODEL_IDS


def resolve_chat_model(slug: Optional[str]) -> CloudflareModel:
    """Map a stored slug to a CloudflareModel enum, defaulting safely.

    Used by /answer to materialise the user's saved preference. Unknown or
    NULL slugs (legacy users, deprecated models) silently fall back to
    DEFAULT_CHAT_MODEL — we never error a chat request on a stale preference.
    """
    if slug:
        for m in CloudflareModel:
            if m.value == slug:
                return m
    return DEFAULT_CHAT_MODEL


def _coerce_token(value) -> str:
    """Coerce a delta value to its string form.

    Cloudflare's qwq-32b endpoint (and possibly other reasoning models) emits
    digit-only tokens as raw JSON numbers — e.g. `{"response": 5}` instead of
    `{"response": "5"}` — when the tokenizer emits a numeric-only token. The
    previous `isinstance(value, str)` guard treated those frames as empty and
    silently dropped them, so any text containing a digit (`$50`, `2:1`,
    `2026`, citation indices `[1]`) lost the digits during streaming. The
    persisted answer ended up with bare punctuation and empty brackets.

    Accept str, int, float, bool — anything trivially renderable as text.
    `None` and dict/list still return "" so role-only / keep-alive frames
    don't get stringified as `"None"`.
    """
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        # bool is a subclass of int; we don't want True/False rendered as
        # tokens, even though Cloudflare has never emitted bool tokens in
        # the wild. The bool exclusion is belt-and-suspenders.
        return str(value)
    return ""


def _extract_stream_delta(chunk: Dict) -> str:
    """Pull the incremental text out of a single Cloudflare SSE chunk.

    Streaming shapes mirror the non-streaming ones:
      * Legacy (Llama, Mistral, qwq-32b): `{"response": <token>}` at the
        top level. qwq-32b emits digit-only tokens as raw JSON numbers, so
        we coerce via _coerce_token rather than guarding on `isinstance str`.
      * OpenAI-compatible (gpt-oss, qwen3): `{"choices": [{"delta":
        {"content": "tok"}}]}`. Some models also emit `reasoning_content`
        on the delta; we discard it — the UI only renders the final answer.

    Returns "" for chunks that carry no user-visible text (role-only deltas,
    keepalives, finish markers).
    """
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
    """Pull the assistant's text out of a Cloudflare AI response.

    Two response shapes are in the wild:

      * Legacy (Llama 3.x, Mistral, qwq-32b): `{"result": {"response": ...}}`.
        Digit-only outputs occasionally arrive as JSON numbers (see qwq
        notes in `_coerce_token`); we coerce via the same helper.
      * OpenAI-compatible (gpt-oss, qwen3): the chat-completion envelope
        with `result.choices[0].message.content`. These models also carry
        a `reasoning_content` field with the chain-of-thought, which we
        deliberately discard — the UI only renders the final answer.

    Returns "" on a missing/malformed payload rather than raising; callers
    handle empties as a soft failure.
    """
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
    """CloudflareChat class to interact with Cloudflare's AI workers."""

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
        """Returns the complete URL with the instance's default model."""
        return self._url_for(self.model)

    def _url_for(self, model: CloudflareModel) -> str:
        return f"{BASE_URL.format(account_id=self.account_id)}{model.value}"

    def _get_headers(self) -> Dict[str, str]:
        """Returns the headers with the API key."""
        return {"Authorization": f"Bearer {self.api_key}"}

    def _format_context(self, search_results: List[Dict]) -> str:
        """Format search results into a numbered context string.

        Each source is prefixed with `[N]` so the model can cite it inline as
        `[N]` (1-indexed). The frontend uses the same indices to render
        anchored citation pills next to the source strip.
        """
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

            if result.get("source") == "custom_url":
                # Custom URL fetches don't have a separate title; keep the URL header.
                parts.append(f"{header}\n{content}")
            else:
                parts.append(f"{header}\n{content}" if content else header)

        return "\n\n".join(parts)

    def _call_for_prompt(
        self,
        messages: List[Dict[str, str]],
        max_tokens: int = DEFAULT_MAX_TOKENS,
        model: Optional[CloudflareModel] = None,
    ) -> Dict:
        """Call the Cloudflare API with the messages list.

        Cloudflare's chat API caps output at 256 tokens by default — too
        short for real marketing answers. Pass a larger `max_tokens` for the
        long-form path; short structured calls can pass SHORT_CALL_MAX_TOKENS.

        `model` overrides the instance's default for this single call — used
        when the user has selected a specific chat model in the UI, or when
        an auxiliary call wants a smaller/faster model than the chat default.

        Raises:
            CloudflareAPIError: If the API call fails
        """
        url = self._url_for(model) if model is not None else self.full_url
        try:
            response = requests.post(
                url,
                headers=self._get_headers(),
                json={"messages": messages, "max_tokens": max_tokens},
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise CloudflareAPIError(f"API call failed: {str(e)}")

    def generate_answer(
        self,
        search_results: List[Dict],
        chat_history: Optional[List[Dict]] = None,
        query: Optional[str] = None,
        previous_queries: Optional[List[str]] = None,
        system_override: Optional[str] = None,
        model: Optional[CloudflareModel] = None,
    ) -> str:
        """Generate an answer using context and chat history.

        `model` overrides the instance default for this call — used when the
        signed-in user has picked a specific chat model in the UI. When None,
        falls back to the instance's configured model (DEFAULT_CHAT_MODEL by
        default).
        """
        formatted = self._build_answer_messages(
            search_results, chat_history, query, previous_queries, system_override
        )
        response = self._call_for_prompt(formatted, model=model)
        return _extract_response_text(response)

    def _build_answer_messages(
        self,
        search_results: List[Dict],
        chat_history: Optional[List[Dict]],
        query: Optional[str],
        previous_queries: Optional[List[str]],
        system_override: Optional[str],
    ) -> List[Dict[str, str]]:
        """Shared message-list builder for both the JSON and streaming paths."""
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
        """Async generator that yields text deltas as Cloudflare emits them.

        Cloudflare Workers AI streams SSE when the request body sets
        `"stream": true`. Each `data:` line is a JSON object whose shape
        matches the non-streaming response: legacy `{"response": "tok"}` or
        OpenAI-shape `{"choices": [{"delta": {"content": "tok"}}]}`. Stream
        terminates with `data: [DONE]`.

        We deliberately consume the body with `httpx.AsyncClient` (rather
        than `requests`) so the FastAPI event loop isn't blocked while the
        model is generating — important when several users are streaming
        simultaneously on a single worker.
        """
        formatted = self._build_answer_messages(
            search_results, chat_history, query, previous_queries, system_override
        )
        url = self._url_for(model) if model is not None else self.full_url
        payload = {"messages": formatted, "max_tokens": max_tokens, "stream": True}

        # No artificial overall timeout — long answers can legitimately take
        # >60s. The read timeout guards against a stalled connection between
        # chunks instead.
        timeout = httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=10.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream(
                "POST", url, headers=self._get_headers(), json=payload
            ) as response:
                if response.status_code >= 400:
                    body = await response.aread()
                    raise CloudflareAPIError(
                        f"Streaming call failed ({response.status_code}): {body.decode('utf-8', errors='replace')[:500]}"
                    )
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    # Cloudflare always prefixes payload lines with `data: `.
                    # Other SSE fields (event:, id:) are not emitted by their
                    # current implementation but skip them defensively.
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if not data:
                        continue
                    if data == "[DONE]":
                        return
                    try:
                        chunk = json.loads(data)
                    except json.JSONDecodeError:
                        # Malformed line — skip rather than abort the whole
                        # turn. The model will still produce subsequent
                        # well-formed chunks.
                        continue
                    delta = _extract_stream_delta(chunk)
                    if delta:
                        yield delta

    def score_search_results(self, query: str, results: List[Dict]) -> Dict[int, int]:
        """Score search results 0–100 for relevance to the user's query.

        Returns `{0_indexed_position: score}`. Empty dict on failure or empty
        input — caller should fall back to static domain authority. Result
        snippets are truncated and the candidate set is capped at 20 to keep
        the prompt cheap; ranks for indices outside the cap are simply absent
        and the caller can default-skip those.

        Why an LLM call here: static domain authority captures "is this
        domain trustworthy", but not "does this result answer THIS query".
        The reranker layers query–result fit on top of the curated list.
        """
        if not results:
            return {}
        capped = list(results)[:20]

        items_text = "\n".join(
            f"[{i + 1}] {(r.get('title') or '').strip()} — {(r.get('url') or '').strip()}\n"
            f"    {(r.get('snippet') or '').strip()[:200]}"
            for i, r in enumerate(capped)
        )

        system_prompt = (
            "You score search results for a paid-acquisition marketing copilot.\n\n"
            "For each candidate, return a relevance score 0-100 where:\n"
            "  90-100  Directly answers the query from a high-authority marketing source\n"
            "          (platform docs, trade press, established marketing publications).\n"
            "  70-89   Strong, on-topic content from a credible source.\n"
            "  40-69   Tangentially related or from a less-trusted source.\n"
            "  0-39    Off-topic, SEO spam, listicle, or untrusted blog.\n\n"
            "Output exactly one line per candidate using `INDEX=SCORE` (e.g. `1=85`). "
            "No commentary, no preamble, no trailing summary."
        )
        user_msg = (
            f"Query: {query.strip()[:300]}\n\n"
            f"Candidates:\n{items_text}\n\n"
            "Now score each one."
        )
        try:
            response = self._call_for_prompt(
                [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_msg},
                ],
                max_tokens=SHORT_CALL_MAX_TOKENS,
                model=DEFAULT_RERANK_MODEL,
            )
            raw = _extract_response_text(response)
        except CloudflareAPIError:
            return {}

        # Tolerant parser — accepts `1=85`, `[1]=85`, `1: 85`, etc. Anything
        # the LLM throws in that doesn't match is dropped silently.
        scores: Dict[int, int] = {}
        line_re = re.compile(r"\[?\s*(\d+)\s*\]?\s*[:=]\s*(\d+)")
        for line in (raw or "").splitlines():
            m = line_re.search(line)
            if not m:
                continue
            idx = int(m.group(1)) - 1
            score = int(m.group(2))
            if 0 <= idx < len(capped) and 0 <= score <= 100:
                scores[idx] = score
        return scores

    def generate_next_steps(self, user_query: str, assistant_answer: str) -> List[str]:
        """Generate up to 3 short follow-up questions a marketer might ask next.

        Cheap, single-shot LLM call. Returns clean strings — no numbering, no
        leading punctuation, no quotes. The caller persists these to the
        message's `next_steps` JSONB column so re-renders are free.
        """
        # Truncate the assistant answer hard — past ~1.5k chars adds nothing
        # to the suggestions and burns tokens. Same for the user query.
        ans = (assistant_answer or "").strip()[:1500]
        q = (user_query or "").strip()[:400]

        system_prompt = _cfg.prompts.next_steps
        user_msg = _cfg.prompts.next_steps_user.format(query=q, answer=ans)
        formatted = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_msg},
        ]
        try:
            response = self._call_for_prompt(
                formatted,
                max_tokens=SHORT_CALL_MAX_TOKENS,
                model=DEFAULT_NEXT_STEPS_MODEL,
            )
            raw = _extract_response_text(response)
        except CloudflareAPIError:
            return []

        # Strip numbering, bullets, quotes, surrounding whitespace.
        cleaned: List[str] = []
        for line in (raw or "").splitlines():
            stripped = line.strip().lstrip("-*•0123456789.) \"'").strip().strip('"').strip()
            if 6 <= len(stripped) <= 200:
                cleaned.append(stripped)
            if len(cleaned) == 3:
                break
        return cleaned

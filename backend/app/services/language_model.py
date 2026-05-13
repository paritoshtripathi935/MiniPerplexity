from dataclasses import dataclass
from typing import AsyncIterator, Optional, List, Dict
from enum import Enum
import json
import re
import httpx
import requests
from pydantic import Field

# Custom exceptions
class CloudflareAPIError(Exception):
    """Raised when Cloudflare API returns an error"""
    pass

class ConfigurationError(Exception):
    """Raised when there's an issue with configuration"""
    pass

# Constants
BASE_URL = "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/"
SYSTEM_PROMPT = "You are a helpful AI assistant. Use the following context to answer questions:\n\n{context}"

# Cloudflare Workers AI defaults `max_tokens` to 256 for chat models, which
# truncates real marketing answers (a channel plan or weekly review easily
# wants 800–2000 tokens). Lift the cap so the model can finish its thought.
DEFAULT_MAX_TOKENS = 4096
# Tighter cap for short structured calls (next-step suggestions, scoring).
SHORT_CALL_MAX_TOKENS = 512


class CloudflareModel(str, Enum):
    """Cloudflare Workers AI models we use.

    All values are smoke-tested against the Cloudflare endpoint to confirm
    the slug actually resolves before being added here. Llama 3.1 70B is on
    Cloudflare's deprecation list — newer requests should not select it.
    """
    GPT_OSS_120B = "@cf/openai/gpt-oss-120b"
    GPT_OSS_20B = "@cf/openai/gpt-oss-20b"
    MISTRAL_SMALL_3_1_24B = "@cf/mistralai/mistral-small-3.1-24b-instruct"
    QWEN3_30B = "@cf/qwen/qwen3-30b-a3b-fp8"
    QWQ_32B = "@cf/qwen/qwq-32b"
    LLAMA_3_2_3B = "@cf/meta/llama-3.2-3b-instruct"
    # Kept for back-compat with messages persisted before the migration.
    # Do not select for new turns — Cloudflare has deprecated it.
    LLAMA_3_1_70B_LEGACY = "@cf/meta/llama-3.1-70b-instruct"

    @classmethod
    def list_models(cls) -> List[str]:
        return [model.name for model in cls]


# Default model when a user has no preference saved. Tuned for marketing
# long-form answers — quality > speed. Users can pick alternatives in the UI.
DEFAULT_CHAT_MODEL = CloudflareModel.GPT_OSS_120B
# Auxiliary calls don't expose a UI — pick fast, structured-output friendly
# models so re-ranking and follow-up generation don't dominate latency.
DEFAULT_RERANK_MODEL = CloudflareModel.QWEN3_30B
DEFAULT_NEXT_STEPS_MODEL = CloudflareModel.LLAMA_3_2_3B


@dataclass(frozen=True)
class ChatModelOption:
    """A model exposed in the UI selector. The slug is what gets persisted on
    `users.preferred_chat_model` and sent to Cloudflare."""
    id: str             # the @cf/... slug
    label: str          # human-readable name shown in the dropdown
    description: str    # one-line tradeoff hint
    recommended: bool = False


# Curated set of models the UI is allowed to pick. Any slug not in this list
# is rejected at the API layer — keeps users from sending arbitrary strings
# to Cloudflare and surprises us with an unbounded model surface.
CHAT_MODEL_CATALOG: List[ChatModelOption] = [
    ChatModelOption(
        id=CloudflareModel.GPT_OSS_120B.value,
        label="GPT-OSS 120B",
        description="Best quality. Reasoning + agentic. Recommended default.",
        recommended=True,
    ),
    ChatModelOption(
        id=CloudflareModel.GPT_OSS_20B.value,
        label="GPT-OSS 20B",
        description="Faster GPT-OSS. Good middle ground for quick answers.",
    ),
    ChatModelOption(
        id=CloudflareModel.MISTRAL_SMALL_3_1_24B.value,
        label="Mistral Small 3.1 24B",
        description="Fast, no chain-of-thought overhead. Vision-capable.",
    ),
    ChatModelOption(
        id=CloudflareModel.QWEN3_30B.value,
        label="Qwen3 30B",
        description="Multilingual; strong on instruction-following.",
    ),
    ChatModelOption(
        id=CloudflareModel.QWQ_32B.value,
        label="QwQ 32B (thinking)",
        description="Reasoning specialist. Slower; use for hard problems.",
    ),
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


@dataclass
class Message:
    """Represents a chat message"""
    role: str
    content: str


class CloudflareChat:
    """CloudflareChat class to interact with Cloudflare's AI workers."""

    def __init__(
        self,
        api_key: str,
        account_id: str,
        model: CloudflareModel = DEFAULT_CHAT_MODEL,
    ) -> None:
        """Initialize the CloudflareChat instance.
        
        Args:
            api_key: Cloudflare API key
            account_id: Cloudflare account ID
            model: The model to use for generating answers

        Raises:
            ConfigurationError: If required parameters are missing or invalid
        """
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

        # Build message list
        messages = []

        if system_override:
            content = system_override
            if search_results:
                content += "\n\n## Sources for this turn\n\n" + self._format_context(search_results)
            messages.append(Message(role="system", content=content))
        elif search_results:
            # Use context-aware system prompt if search results exist
            messages.append(Message(
                role="system",
                content=SYSTEM_PROMPT.format(context=self._format_context(search_results))
            ))
        else:
            # Use a basic system prompt for direct questions
            messages.append(Message(
                role="system",
                content="You are a helpful AI assistant."
            ))

        if chat_history:
            messages.extend([Message(**msg) for msg in chat_history])

        # Format query with previous context if available
        query_context = query
        if previous_queries:
            query_context = (
                f"Previous questions in this conversation: {' | '.join(previous_queries)}\n\n"
                f"Current question: {query}"
            )

        if query_context:
            messages.append(Message(role="user", content=query_context))

        # Convert messages to dict format for API
        formatted_messages = [
            {"role": msg.role, "content": msg.content}
            for msg in messages
        ]

        response = self._call_for_prompt(formatted_messages, model=model)
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
        messages: List[Message] = []
        if system_override:
            content = system_override
            if search_results:
                content += "\n\n## Sources for this turn\n\n" + self._format_context(search_results)
            messages.append(Message(role="system", content=content))
        elif search_results:
            messages.append(Message(
                role="system",
                content=SYSTEM_PROMPT.format(context=self._format_context(search_results))
            ))
        else:
            messages.append(Message(role="system", content="You are a helpful AI assistant."))

        if chat_history:
            messages.extend([Message(**msg) for msg in chat_history])

        query_context = query
        if previous_queries:
            query_context = (
                f"Previous questions in this conversation: {' | '.join(previous_queries)}\n\n"
                f"Current question: {query}"
            )
        if query_context:
            messages.append(Message(role="user", content=query_context))

        return [{"role": m.role, "content": m.content} for m in messages]

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

        system_prompt = (
            "You are a paid-acquisition marketing copilot. Given a user's "
            "question and your previous answer, suggest 3 short follow-up "
            "questions the user is most likely to ask next.\n\n"
            "Rules:\n"
            "- Each question stands on its own (a stranger could read it cold).\n"
            "- Each is under 90 characters.\n"
            "- No preamble, no numbering, no quotes — return ONE question per line.\n"
            "- Skip generic 'tell me more' filler; favour concrete next moves "
            "(channels, KPIs, benchmarks, creative angles, time horizons)."
        )
        user_msg = (
            f"User asked: {q}\n\n"
            f"Your answer (truncated): {ans}\n\n"
            "Now write the 3 follow-up questions, one per line."
        )
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

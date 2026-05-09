from dataclasses import dataclass
from typing import Optional, List, Dict
from enum import Enum
import re
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


class CloudflareModel(Enum):
    """Available Cloudflare AI models"""
    LLAMA_3_70B_INSTRUCT = "@cf/meta/llama-3.1-70b-instruct"

    @classmethod
    def list_models(cls) -> List[str]:
        """Returns a list of available models"""
        return [model.name for model in cls]


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
        model: CloudflareModel = CloudflareModel.LLAMA_3_70B_INSTRUCT
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
        """Returns the complete URL with the specified model."""
        return f"{BASE_URL.format(account_id=self.account_id)}{self.model.value}"

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
    ) -> Dict:
        """Call the Cloudflare API with the messages list.

        Cloudflare's chat API caps output at 256 tokens by default — too
        short for real marketing answers. Pass a larger `max_tokens` for the
        long-form path; short structured calls can pass SHORT_CALL_MAX_TOKENS.

        Raises:
            CloudflareAPIError: If the API call fails
        """
        try:
            response = requests.post(
                self.full_url,
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
    ) -> str:
        """Generate an answer using context and chat history.

        Args:
            search_results: Search results to provide context (can be empty)
            chat_history: Previous conversation messages
            query: Current query
            previous_queries: List of previous queries in the session
            system_override: Marketing-tuned system prompt composed by
                app.services.system_prompt.compose_system_prompt. When set,
                overrides the default helpful-assistant prompt and gets the
                search-result context appended.

        Returns:
            The generated answer
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

        response = self._call_for_prompt(formatted_messages)
        return response["result"]["response"]

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
            )
            raw = response["result"]["response"]
        except (CloudflareAPIError, KeyError):
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
            response = self._call_for_prompt(formatted, max_tokens=SHORT_CALL_MAX_TOKENS)
            raw = response["result"]["response"]
        except (CloudflareAPIError, KeyError):
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

from dataclasses import dataclass
from typing import Optional, List, Dict
from enum import Enum
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
        """Format search results into a context string."""
        context_parts = []
        
        for result in search_results:
            if result.get('source') == 'custom_url':
                context_parts.append(
                    f"Content from provided URL ({result['url']}):\n{result['search_content']}"
                )
            else:
                context_parts.append(result['search_content'])
        
        return "\n\n".join(context_parts)

    def _call_for_prompt(self, messages: List[Dict[str, str]]) -> Dict:
        """Call the Cloudflare API with the messages list.
        
        Args:
            messages: List of message dictionaries with 'role' and 'content'
            
        Returns:
            API response dictionary
            
        Raises:
            CloudflareAPIError: If the API call fails
        """
        try:
            response = requests.post(
                self.full_url,
                headers=self._get_headers(),
                json={"messages": messages}
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
        previous_queries: Optional[List[str]] = None
    ) -> str:
        """Generate an answer using context and chat history.

        Args:
            search_results: Search results to provide context (can be empty)
            chat_history: Previous conversation messages
            query: Current query
            previous_queries: List of previous queries in the session

        Returns:
            The generated answer
        """
        
        # Build message list
        messages = []
        
        if search_results:
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

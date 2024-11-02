from typing import Optional, List
from enum import Enum
import requests
from pydantic import Field


class CloudflareModel(Enum):
    LLAMA_3_70B_INSTRUCT = "@cf/meta/llama-3.1-70b-instruct"

    @classmethod
    def list_models(cls):
        return [model.name for model in cls]
    
    
    def list_models(cls):
        """Returns a list of available models"""
        return [model.name for model in cls]


class CloudflareChat:
    """
    CloudflareChat class to interact with Cloudflare's AI workers.
    
    Available models:
    - LLAMA_2_7B_CHAT_FP16
    - LLAMA_2_7B_CHAT_INT8
    - LLAMA_3_8B_INSTRUCT_AWQ
    - LLAMA_3_8B_INSTRUCT
    - LLAMA_3_1_70B_INSTRUCT
    - LLAMA_3_1_8B_INSTRUCT_AWQ
    - LLAMA_3_1_8B_INSTRUCT_FAST
    - LLAMA_3_1_8B_INSTRUCT_FP8
    - LLAMA_3_2_11B_VISION_INSTRUCT
    """

    name: str = "CloudflareChat"
    api_key: Optional[str] = None
    account_id: Optional[str] = None
    model: CloudflareModel = Field(default=CloudflareModel.LLAMA_3_8B_INSTRUCT)
    base_url: str = "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/"

    def __init__(self, api_key: Optional[str], account_id: str, model: CloudflareModel = CloudflareModel.LLAMA_3_8B_INSTRUCT):
        """
        Initialize the CloudflareChat instance.
        
        Args:
            api_key (str): Cloudflare API key
            account_id (str): Cloudflare account ID
            model (CloudflareModel): The model to use for generating answers
        """
        self.api_key = api_key
        self.account_id = account_id

        if not isinstance(model, CloudflareModel):
            raise ValueError(f"Invalid model specified. Choose from: {', '.join(CloudflareModel.list_models())}")
        
        self.model = model

        if self.account_id is None:
            raise ValueError("account_id must be specified")

        if self.api_key is None:
            raise ValueError("api_key must be specified")

    @property
    def full_url(self) -> str:
        """Returns the complete URL with the specified model."""
        return f"{self.base_url.format(account_id=self.account_id)}{self.model.value}"

    def _get_headers(self) -> dict:
        """Returns the headers with the specified API key."""
        return {"Authorization": f"Bearer {self.api_key}"}

    def _format_context(self, search_results: dict) -> str:
        """Format search results into a context string."""
        context = "This is search results from search engine:\n"
        
        for search_result in search_results:
            if search_result['search_content'] is not None:
                context += f"\n{search_result['search_content']}\n"
        
        return context

    def _call_for_prompt(self, messages: List[dict]) -> dict:
        """
        Call the Cloudflare API with the messages list.
        Each message should have 'role' and 'content'.
        """
        headers = self._get_headers()
        payload = {"messages": messages}
        
        try:
            print(f"Sending request to {self.full_url} with payload: {payload}")
            response = requests.post(self.full_url, headers=headers, json=payload)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            return {"error": str(e)}

    def invoke(self, search_results: dict, chat_history: List[dict] = None, query: str = None) -> dict:
        """
        Invoke the Cloudflare API with context and chat history.
        
        Args:
            search_results (dict): Search results to provide context
            chat_history (List[dict]): Previous conversation messages
            query (str): The user's query
        
        Returns:
            dict: The response from the Cloudflare API
        """
        if not search_results:
            raise ValueError("No search results provided")

        messages = []
        
        # Add system message with context
        context = self._format_context(search_results)
        messages.append({
            "role": "system",
            "content": f"You are a helpful AI assistant. Use the following context to answer questions:\n\n{context}"
        })

        # Add chat history if available
        if chat_history:
            messages.extend(chat_history)

        # Add current question
        messages.append({
            "role": "user",
            "content": query
        })

        return self._call_for_prompt(messages)

    def generate_answer(self, search_results: List[dict], chat_history: List[dict] = None, query: str = None) -> str:
        """
        Generates an answer using context and chat history.

        Args:
            search_results (dict): Search results to provide context
            chat_history (List[dict]): Previous conversation messages

        Returns:
            str: The generated answer
        """
        response = self.invoke(search_results, chat_history, query)
        if "error" in response:
            raise ValueError(response["error"])
        return response["result"]["response"]

# Technical Design Analysis - Mini Perplexity

## Core Architecture Decisions

### 1. Parallel Search Implementation
The system implements parallel search execution across multiple search engines (Google and Bing) to improve response times and data quality:
```
def perform_search(query: str) -> List[SearchResult]:
    """
    Perform searches on both Google and Bing Custom Search APIs.
    """
    with ThreadPoolExecutor(max_workers=2) as executor:
        bing_future, google_future = executor.submit(search_bing, query), executor.submit(search_google, query)
        
        # Combine results from both searches
        results = list(itertools.chain(bing_future.result(), google_future.result()))
        
        # Remove duplicate results
        seen = set()
        filtered_results = []
        for result in results:
            if result["url"] not in seen:
                seen.add(result["url"])
                filtered_results.append(result)
        
    return filtered_results
```
**Rationale:**
- Using ThreadPoolExecutor enables concurrent API calls
- Reduces total response time by executing searches in parallel
- Deduplication prevents redundant results
- Error handling for each search provider ensures graceful degradation

### 2. Context-Aware Response Generation

The system maintains conversation context through session management and intelligent prompt engineering:
```
def invoke(self, search_results: dict, chat_history: List[dict] = None, query: str = None) -> dict:
    """
    Invoke the Cloudflare API with context and chat history.
    """
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
```
**Key Design Choices:**
- Session-based context tracking
- Hierarchical message structure (system → history → current query)
- Context injection through formatted search results
- Stateless API design with client-side session ID generation

### 3. Progressive Loading and User Feedback

The frontend implements sophisticated loading states and real-time feedback:
```
const handleSearch = async (query: string) => {
  const userMessage = {
    id: uuidv4(),
    type: 'user',
    content: query,
    timestamp: new Date()
  };
  
  setMessages(prev => [...prev, userMessage]);

  try {
    const responseMessage = {
      id: uuidv4(),
      type: 'assistant',
      content: '🤔 Let me think about that...\n',
      timestamp: new Date(),
      search_results: [],
      isSearching: true
    };
    
    setMessages(prev => [...prev, responseMessage]);

    // First get search results with progress updates
    const searchResults = await performSearch(query, (url, status) => {
      setMessages(prev => prev.map(msg => 
        msg.id === responseMessage.id 
          ? {
              ...msg,
              content: msg.content + `\n🔍 Searching: ${url}\n`,
              animation: 'animate-pulse'
            }
          : msg
      ));
    });

    // Get final answer and update message
    const answerResponse = await getAnswer(query, sessionId, searchResults);
    if (answerResponse?.answer) {
      setMessages(prev => prev.map(msg => 
        msg.id === responseMessage.id 
          ? {
              ...msg,
              content: answerResponse.answer,
              search_results: searchResults,
              sources: answerResponse.citations,
              isSearching: false
            }
          : msg
      ));
    }
  } catch (err) {
    setError(`Failed to fetch answer: ${err}`);
  }
};
```
## Technical Challenges & Solutions

### 1. Search Result Processing

**Challenge:** Efficiently processing and extracting relevant content from search results.

**Solution:**
```
def fetch_content_from_url(url: str) -> str:
    """
    Fetch and extract main text content from a URL.
    """
    headers = {
        "User-Agent": random.choice([
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        ])
    }

    try:
        response = requests.get(url, headers=headers, timeout=5)
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Extract first 2 sentences from each paragraph
        search_content = ' '.join(
            '. '.join(p.get_text().split('. ')[:2]) + '.'
            for p in soup.find_all('p')[:5] if p.get_text()
        )
        
        return search_content[:5000]  # Limit content size
    except Exception as e:
        return ""
```
Key approaches:
- Selective content extraction
- Parallel processing
- Content length limits
- User agent rotation

### 2. State Management

**Challenge:** Maintaining conversation coherence while handling asynchronous operations.

**Solution:**
```
interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: {
    url: string;
    title: string;
    type: string;
  }[];
  search_results?: {
    source: string;
    type: string;
    title: string;
  }[];
  isSearching?: boolean;
}
```
Implementation details:
- Strongly typed interfaces
- Support for multiple result types
- Loading state tracking
- Source attribution system

### 3. Rate Limiting Implementation

**Challenge:** Managing API call frequency to external services while maintaining responsiveness.

**Solution:**
- Implemented token bucket algorithm for rate limiting
- Per-function tracking of API calls
- Configurable thresholds and periods
- Automatic cleanup of expired tokens
- Graceful request throttling

Key implementation details:
- Custom rate limiter decorator
- Thread-safe token management
- Debug logging for monitoring
- Configurable wait times
- Automatic token cleanup

Benefits:
- Prevents API quota exhaustion
- Maintains service stability
- Provides visibility into API usage
- Enables fine-grained control
- Supports multiple API endpoints

## Security Considerations

### 1. Authentication Implementation

```
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <App />
    </ClerkProvider>
  </StrictMode>
);
```
Security measures:
- Clerk authentication
- Environment variables
- Protected endpoints
- Secure sessions

### 2. API Security

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://mini-perplexity.netlify.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Implemented safeguards:
- CORS configuration
- Origin validation
- Method restrictions
- Credential handling

## Future Considerations

1. **Scalability Improvements**
   - Redis for session management
   - Load balancing
   - Caching layer
   - Rate limiting

2. **Feature Enhancements**
   - Voice interface
   - Multi-language support
   - Document upload
   - Advanced context management

3. **Performance Upgrades**
   - Response streaming
   - Progressive web app
   - Advanced caching
   - Search result ranking

This analysis demonstrates how the system balances functionality, performance, and security while maintaining code quality and user experience. The modular architecture allows for future enhancements while the current implementation provides a solid foundation for an AI-powered chat assistant.
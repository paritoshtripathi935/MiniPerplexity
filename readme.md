# 🤖 Mini Perplexity - AI-Powered Chat Assistant with Real-Time Search

![Mini Perplexity Demo](https://mini-perplexity.netlify.app/demo.gif)

Experience intelligent conversations powered by AI at [Mini Perplexity](https://mini-perplexity.netlify.app/)

[![Netlify Status](https://api.netlify.com/api/v1/badges/48d8733e-bef8-4967-a416-73c53bdb1ecf/deploy-status)](https://app.netlify.com/sites/mini-perplexity/deploys)

## 🚀 Why Mini Perplexity?

Mini Perplexity revolutionizes the way you interact with AI chat assistants by combining:
- Real-time web search capabilities
- State-of-the-art language models
- Secure user authentication
- Beautiful, responsive interface
- Transparent source attribution

Perfect for developers, researchers, and anyone seeking intelligent, sourced conversations.

### ✨ Key Features

- **AI-Powered Intelligence**: Harness Cloudflare's advanced AI models for human-like conversations
- **Live Web Search**: Access real-time information through Google and Bing APIs
- **Custom URL Analysis**: Extract and analyze content from specific webpages
- **Secure Access**: Enterprise-grade authentication powered by Clerk
- **Stunning UI/UX**: 
  - Dark/Light mode support
  - Responsive design across all devices
  - Dynamic typing animations
  - Interactive message history
- **Smart Context Management**: Maintains conversation flow for natural interactions
- **Enterprise-Ready**: Built-in rate limiting and session management

## 🛠️ Technology Stack

### Modern Frontend
```
- React 18 + TypeScript
- Tailwind CSS
- Clerk Authentication
- Lucide React Icons
- React Markdown
```

### Powerful Backend
```
- FastAPI
- Cloudflare AI
- Pydantic
- Multiple Search APIs
- Custom Rate Limiting
```

## 📦 Quick Start Guide

### 1. Clone & Setup

```bash
# Clone repository
git clone https://github.com/yourusername/mini-perplexity.git
cd mini-perplexity

# Frontend setup
cd frontend
npm install

# Backend setup
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Environment Configuration

```plaintext
# Frontend (.env)
VITE_API_HOST=http://localhost:8000
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_key

# Backend (.env)
CLOUDFLARE_API_KEY=your_cloudflare_key
CLOUDFLARE_ACCOUNT_ID=your_account_id
GOOGLE_API_KEY=your_google_key
GOOGLE_SEARCH_CX=your_search_cx
BING_API_KEY=your_bing_key
```

### 3. Launch Application

```bash
# Start backend
cd backend
uvicorn app.main:app --reload

# Start frontend
cd frontend
npm run dev
```

Visit `http://localhost:5173` to see your application running.

## 🌟 Advanced Features
### Language Model Support
- Powered by Meta's Llama 3.1 family
- Currently using LLAMA_3_1_70B_INSTRUCT for optimal performance
- Supports multiple models including:
  - LLAMA_3_8B_INSTRUCT
  - LLAMA_3_1_70B_INSTRUCT
  - LLAMA_3_2_11B_VISION_INSTRUCT

### Intelligent Rate Limiting
```python
@rate_limit(calls=30, period=60)
def search_api():
    # Smart API call management
```

### Context Management
- Session-based conversation tracking
- Efficient state management
- Real-time UI updates
- Persistent conversation history

### Search Results and Media Display

The application displays search results in a structured order:

1. **Web Search Results**
   - Displayed in a 2-column grid
   - Shows title and source type
   - Blue accent colors for web results
   - Hover effects for better interactivity

2. **YouTube Videos**
   - Compact 4-column grid layout on large screens, 2-column on mobile
   - Thumbnail previews with fallback images
   - Video title with single-line truncation
   - Red accent colors for YouTube branding
   - Smooth hover animations
   - Automatic quality adjustment for thumbnails (maxresdefault → hqdefault)

3. **Citations/Sources**
   - Displayed as compact chips
   - Shows truncated URLs
   - Includes external link indicators
   - Grouped together at the bottom

### Component Structure

The search results are implemented in two main components:
- `ChatMessage.tsx`: For in-conversation display
- `Answer.tsx`: For standalone answer display

Both components maintain consistent styling and behavior while adapting to their respective contexts.

### Styling Guidelines

- Dark mode support throughout all result types
- Consistent spacing with `space-y-4` between sections
- Responsive grid layouts
- Accessible color contrasts
- Interactive hover states
- Truncation for long content
- Consistent icon usage:
  - 🔍 Search icon for web results
  - 📺 YouTube icon for video results
  - 🔗 External link icon for sources

### Custom URL Analysis
Analyze specific web content by providing custom URLs:

#### How It Works
1. Click the link icon (🔗) in the search bar
2. Paste your URL in the additional input field
3. Enter your query about the content
4. Get AI-powered insights specifically about that webpage

##### Example Usage

###### Analyzing Documentation
URL: https://reactjs.org/docs/hooks-intro.html
Query: "Summarize the key concepts of React Hooks from this page"

###### Research Papers
URL: https://arxiv.org/abs/2303.08774
Query: "What are the main findings of this paper?"

###### News Articles
URL: https://example.com/tech-news
Query: "What are the key points discussed in this article?"

#### Features
- **Smart Content Extraction**: Intelligently parses webpage content
- **Source Attribution**: Clear reference to the analyzed URL
- **Rate Limited**: Protected against abuse with smart rate limiting
- **Error Handling**: Graceful handling of invalid URLs or inaccessible content
- **Context Awareness**: Maintains conversation context with the extracted content

#### Technical Details
- Content extraction using BeautifulSoup4
- Config

## 🚀 Deployment

### Netlify (Frontend)
1. Connect GitHub repository
2. Configure build:
   - Command: `npm run build`
   - Directory: `dist`
3. Set environment variables

### Render (Backend)
1. Link repository
2. Configure service:
   - Type: Web Service
   - Build: `pip install -r requirements.txt`
   - Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

## 🔮 Future Roadmap

### Coming Soon
1. **Performance Upgrades**
   - Response streaming
   - Query caching
   - Redis integration

2. **New Features**
   - Multi-language support
   - Voice interactions
   - Custom knowledge bases

3. **Infrastructure**
   - Enhanced monitoring
   - Distributed rate limiting
   - Load balancing

## 🤝 Contributing

We welcome contributions! Check our [Contributing Guidelines](CONTRIBUTING.md) for details on:
- Code style
- Pull request process
- Development workflow

## 📄 License

MIT License - See [LICENSE](LICENSE) for details

## 🙏 Acknowledgments

- Cloudflare AI team
- Search API providers
- Open source community

---

Built with ❤️ by [Paritosh Tripathi]

Tags: #AI #ChatAssistant #WebSearch #React #FastAPI #CloudflareAI #OpenSource
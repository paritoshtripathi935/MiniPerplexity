# Mini Perplexity AI Chat Assistant

Visit [Mini Perplexity](https://mini-perplexity.netlify.app/) to try the project!

[![Netlify Status](https://api.netlify.com/api/v1/badges/48d8733e-bef8-4967-a416-73c53bdb1ecf/deploy-status)](https://app.netlify.com/sites/mini-perplexity/deploys)

## Overview

Mini Perplexity is an AI-powered chat assistant that combines real-time web search capabilities with natural language processing. Built with modern web technologies, it offers an intuitive interface for users to ask questions and receive comprehensive, sourced answers.

### Key Features

- **AI-Powered Responses**: Leverages Cloudflare's AI models for intelligent answer generation
- **Real-time Web Search**: Integrates Google and Bing search APIs for up-to-date information
- **User Authentication**: Secure access with Clerk authentication
- **Dark Mode Support**: Customizable interface for better usability
- **Responsive Design**: Fully adaptive layout across devices
- **Source Attribution**: Transparent citation of information sources
- **Interactive UI**: Dynamic typing animations and loading states
- **Session Management**: Maintains conversation context for better responses

## Technology Stack

### Frontend
- React 18 with TypeScript
- Tailwind CSS for styling
- Clerk for authentication
- Lucide React for icons
- React Markdown for content rendering

### Backend
- FastAPI framework
- Cloudflare AI integration
- Pydantic for data validation
- Multiple search API integrations

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/mini-perplexity.git
   cd mini-perplexity
   ```

2. Set up the frontend:

   ```bash
   cd frontend
   npm install
   ```

3. Set up the backend:

   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

4. Configure environment variables:

   Frontend `.env`:

   ```plaintext
   VITE_API_HOST=http://localhost:8000
   VITE_CLERK_PUBLISHABLE_KEY=your_clerk_key
   ```

   Backend `.env`:

   ```plaintext
   CLOUDFLARE_API_KEY=your_cloudflare_key
   CLOUDFLARE_ACCOUNT_ID=your_account_id
   GOOGLE_API_KEY=your_google_key
   GOOGLE_SEARCH_CX=your_search_cx
   BING_API_KEY=your_bing_key
   ```

## Running the Application

1. Start the backend server:

   ```bash
   cd backend
   uvicorn app.main:app --reload
   ```

2. Start the frontend development server:

   ```bash
   cd frontend
   npm run dev
   ```

3. Access the application at `http://localhost:5173`

## Deployment

### Frontend Deployment (Netlify)

1. Connect your repository to Netlify
2. Configure build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
3. Add environment variables in Netlify dashboard

### Backend Deployment (Render)

1. Connect your repository to Render
2. Configure the service:
   - Type: Web Service
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

## Architecture and Design Decisions

### Frontend Architecture
- Component-based structure for maintainability
- Custom hooks for state management
- Responsive design with Tailwind CSS
- Progressive loading states for better UX

### Backend Architecture
- RESTful API design with FastAPI
- Parallel search execution for faster results
- Session-based context management
- Error handling and validation with Pydantic

## Maintaining LLM Context

### Backend Implementation
The backend maintains conversation context through:
- Unique session IDs for each user interaction
- In-memory conversation history storage
- Context-aware prompt engineering
- Efficient state management with FastAPI

### Frontend Implementation
The frontend manages context through:
- React state management for conversation flow
- Real-time UI updates with loading states
- Efficient message rendering and history display
- Session persistence across page reloads

## Challenges and Solutions

1. **Search Result Integration**
   - Challenge: Combining multiple search APIs
   - Solution: Implemented parallel processing with ThreadPoolExecutor

2. **Context Management**
   - Challenge: Maintaining conversation context
   - Solution: Session-based storage with unique IDs

3. **Response Generation**
   - Challenge: Coherent AI responses with citations
   - Solution: Custom prompt engineering with source context

## Future Improvements

1. **Performance Optimization**
   - Implement caching for frequent queries
   - Add response streaming capabilities

2. **Feature Enhancements**
   - Multi-language support
   - Voice input/output
   - Custom knowledge base integration

3. **Infrastructure**
   - Add Redis for session management
   - Implement rate limiting
   - Add comprehensive monitoring

## Language Model Support

### Current Models

CloudflareChat currently supports the large language models from Meta's Llama 3.1 family and other models from Meta, Google, Anthropic, and OpenAI. Some examples include:

- `LLAMA_2_7B_CHAT_FP16`
- `LLAMA_2_7B_CHAT_INT8`
- `LLAMA_3_8B_INSTRUCT_AWQ`
- `LLAMA_3_8B_INSTRUCT`
- `LLAMA_3_1_70B_INSTRUCT`
- `LLAMA_3_1_8B_INSTRUCT_AWQ`
- `LLAMA_3_1_8B_INSTRUCT_FAST`
- `LLAMA_3_1_8B_INSTRUCT_FP8`
- `LLAMA_3_2_11B_VISION_INSTRUCT`

Current Model in Production: `LLAMA_3_1_70B_INSTRUCT` because it is the most powerful and has the best performance.

### Usage

You can specify the model when initializing the CloudflareChat instance:

```python
from backend.app.services.language_model import CloudflareChat, CloudflareModel

chat = CloudflareChat(
    api_key="your-api-key",
    account_id="your-account-id",
    model=CloudflareModel.LLAMA_3_70B_INSTRUCT
)
```

### Future Model Support

The system is designed with multi-model support in mind. Future updates will include:

- Support for additional Cloudflare AI models as they become available
- Integration with other LLM providers (e.g., OpenAI, Anthropic)
- Custom model configuration options
- Model fallback and load balancing capabilities
- Performance metrics and cost optimization features

To maintain flexibility for future expansion, the system uses an enum-based model selection system that can be easily extended to support new models and providers.

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit pull requests to our repository.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Cloudflare for AI model access
- Search API providers
- Open source community for tools and libraries
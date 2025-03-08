# Mini Perplexity: AI Chat Assistant with Real-Time Web Search & Analysis
**Note** - Wait While Using Backend is deployed on Render sometimes it goes to sleep
<div align="center">

[![Live Demo](https://img.shields.io/badge/Live-Demo-blue?style=flat-square)](https://mini-perplexity.netlify.app/)
[![Netlify Status](https://api.netlify.com/api/v1/badges/48d8733e-bef8-4967-a416-73c53bdb1ecf/deploy-status?style=flat-square)](https://app.netlify.com/sites/mini-perplexity/deploys)
[![GitHub stars](https://img.shields.io/github/stars/paritoshtripathi935/MiniPerplexity?style=flat-square)](https://github.com/paritoshtripathi935/MiniPerplexity/stargazers)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](https://github.com/paritoshtripathi935/MiniPerplexity/blob/main/LICENSE)

[View Demo](https://mini-perplexity.netlify.app/) | [Documentation](#-documentation) | [Quick Start](#-quick-start) | [Features](#-key-features) | [Contributing](#-contributing)

![Mini Perplexity Demo](https://mini-perplexity.netlify.app/demo.gif)

</div>

## 🌟 Overview

Mini Perplexity is an advanced AI chat assistant that combines real-time web search capabilities with state-of-the-art language models. Built with React, FastAPI, and Cloudflare AI, it offers an enterprise-grade solution for intelligent, context-aware conversations with accurate source attribution.

### What Makes Mini Perplexity Special?

- 🔍 **Real-time Web Intelligence**: Integrates Google and Bing search APIs for up-to-date information
- 🤖 **Advanced AI Models**: Powered by Meta's Llama 3.1 family for human-like conversations
- 🔒 **Enterprise Security**: Clerk authentication and smart rate limiting
- 📱 **Responsive Design**: Beautiful UI that works seamlessly across all devices
- 🎯 **Smart Context**: Maintains conversation flow with efficient state management

## 🚀 Key Features

### AI & Search Capabilities
- Real-time web search integration
- Custom URL content analysis
- Multiple AI model support (LLAMA_3_1_70B_INSTRUCT, LLAMA_3_8B_INSTRUCT)
- Intelligent context management

### User Experience
- Dark/Light mode theming
- Dynamic typing animations
- Responsive grid layouts
- Interactive message history
- Structured search result display

### Enterprise Features
- Secure authentication
- Rate limiting
- Session management
- Source attribution
- Error handling

## 💻 Technology Stack

### Frontend
```
React 18 + TypeScript
Tailwind CSS
Clerk Authentication
Lucide React Icons
React Markdown
```

### Backend
```
FastAPI
Cloudflare AI
Pydantic
Google & Bing Search APIs
Custom Rate Limiting
```

## 📖 Documentation

### Installation Requirements
- Node.js 16+
- Python 3.8+
- NPM or Yarn
- Virtual environment tool

### Environment Setup
```bash
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

## 🚦 Quick Start

```bash
# Clone and install
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

# Launch application
npm run dev           # Frontend
uvicorn app.main:app --reload  # Backend
```

Visit `http://localhost:5173` to start using Mini Perplexity.

## 🔮 Roadmap

- Response streaming implementation
- Multi-language support
- Voice interaction capabilities
- Redis-based caching
- Custom knowledge base integration
- Enhanced monitoring and analytics

## 🤝 Contributing

We welcome contributions! See our [Contributing Guidelines](CONTRIBUTING.md) for:
- Code style guide
- Development workflow
- Pull request process

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Cloudflare AI](https://developers.cloudflare.com/workers-ai/) for AI capabilities
- [Clerk](https://clerk.dev/) for authentication
- [FastAPI](https://fastapi.tiangolo.com/) framework
- Open source community

---

<div align="center">

Created by [Paritosh Tripathi](https://github.com/yourusername) | [Report Bug](https://github.com/yourusername/mini-perplexity/issues) | [Request Feature](https://github.com/yourusername/mini-perplexity/issues)

If you find this project useful, please consider giving it a ⭐️

</div>

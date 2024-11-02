# Contributing to Mini Perplexity

Thank you for your interest in contributing to Mini Perplexity! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Contributions](#making-contributions)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment. We expect all contributors to:

- Use welcoming and inclusive language
- Be respectful of differing viewpoints
- Accept constructive criticism gracefully
- Focus on what's best for the community
- Show empathy towards other community members

## Getting Started

1. Fork the repository
2. Clone your fork:
```bash
git clone https://github.com/yourusername/mini-perplexity.git
```
3. Add the upstream remote:
```bash
git remote add upstream https://github.com/original/mini-perplexity.git
```

## Development Setup

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file with required environment variables:
```plaintext
VITE_API_HOST=http://localhost:8000
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_key
```

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create and activate virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Create a `.env` file with required environment variables:
```plaintext
CLOUDFLARE_API_KEY=your_cloudflare_key
CLOUDFLARE_ACCOUNT_ID=your_account_id
```

## Project Structure

### Frontend Structure
```plaintext
frontend/
├── src/
│   ├── components/    # React components
│   ├── services/      # API services
│   ├── types/         # TypeScript types
│   └── styles/        # CSS and styling
├── public/            # Static assets
└── tests/            # Test files
```

### Backend Structure
```plaintext
backend/
├── app/
│   ├── api/          # API endpoints
│   ├── core/         # Core functionality
│   ├── models/       # Data models
│   ├── services/     # Business logic
│   └── utils/        # Utility functions
└── tests/           # Test files
```

## Making Contributions

1. Create a new branch for your feature:
```bash
git checkout -b feature/your-feature-name
```

2. Make your changes and commit them:
```bash
git add .
git commit -m "feat: add new feature"
```

3. Push to your fork:
```bash
git push origin feature/your-feature-name
```

## Coding Standards

### Frontend Standards

- Use TypeScript for all new code
- Follow ESLint configuration
- Use functional components with hooks
- Implement proper type definitions
- Use Tailwind CSS for styling
- Follow component structure:

```typescript
interface ComponentProps {
  // Props definition
}

export function ComponentName({ prop1, prop2 }: ComponentProps) {
  // Component implementation
}
```

### Backend Standards

- Follow PEP 8 style guide
- Use type hints for all functions
- Implement proper error handling
- Write docstrings for all functions
- Follow FastAPI best practices

Example:
```python
from fastapi import HTTPException
from typing import List

async def process_data(input_data: str) -> List[str]:
    """
    Process the input data and return results.
    
    Args:
        input_data: The input string to process
        
    Returns:
        List of processed strings
        
    Raises:
        HTTPException: If processing fails
    """
    try:
        # Implementation
        pass
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

## Testing

### Frontend Testing
- Write unit tests for components
- Test all API integrations
- Ensure responsive design works
- Test dark/light mode functionality

### Backend Testing
- Write unit tests for API endpoints
- Test rate limiting functionality
- Verify error handling
- Test search and answer generation

## Pull Request Process

1. Update documentation for any new features
2. Add tests for new functionality
3. Ensure all tests pass
4. Update the README.md if needed
5. Submit PR with clear description of changes
6. Wait for review and address feedback

## Language Model Support

The project currently uses Cloudflare AI models. When contributing new model integrations:

1. Add model to CloudflareModel enum:
```python
class CloudflareModel(Enum):
    """Available Cloudflare AI models"""
    LLAMA_3_70B_INSTRUCT = "@cf/meta/llama-3.1-70b-instruct"
    # Add new models here
```

2. Implement proper error handling
3. Add rate limiting considerations
4. Update documentation

## Questions or Need Help?

Feel free to:
- Open an issue for questions
- Join our community discussions
- Reach out to maintainers

Thank you for contributing to Mini Perplexity!
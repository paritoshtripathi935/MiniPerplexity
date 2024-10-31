from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from app.core.settings import BackendBaseSettings
from app.api.v1.query_handler import router
import os

# Load settings
settings = BackendBaseSettings()

# Initialize FastAPI app with settings
app = FastAPI(**settings.set_backend_app_attributes)

# Set up CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://mini-perplexity.netlify.app"],  # Add your production frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API router
app.include_router(router, prefix="/api/v1")

# Health Check Endpoint
@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
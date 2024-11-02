import logging
import pathlib
import os
from pydantic_settings import BaseSettings  # Ensure you have pydantic-settings installed

ROOT_DIR: pathlib.Path = pathlib.Path(__file__).parent.parent.parent.parent.parent.resolve()


class BackendBaseSettings(BaseSettings):
    TITLE: str = "Mini Perplexity System"
    VERSION: str = "0.1.0"
    TIMEZONE: str = "UTC"
    DESCRIPTION: str | None = None
    DEBUG: bool = False

    # Get environment from env variable, default to 'development'
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    
    # Only show docs in development
    @property
    def DOCS_URL(self) -> str | None:
        return "/docs" if self.ENVIRONMENT == "development" else None
        
    @property
    def REDOC_URL(self) -> str | None:
        return "/redoc" if self.ENVIRONMENT == "development" else None
        
    @property
    def OPENAPI_URL(self) -> str | None:
        return "/openapi.json" if self.ENVIRONMENT == "development" else None

    API_PREFIX: str = "/api"
    OPENAPI_PREFIX: str = ""

    class Config:
        case_sensitive: bool = True
        env_file: str = f"{str(ROOT_DIR)}/.env"
        validate_assignment: bool = True

    @property
    def set_backend_app_attributes(self) -> dict[str, str | bool | None]:
        """
        Set all `FastAPI` class' attributes with the custom values defined in `BackendBaseSettings`.
        """
        return {
            "title": self.TITLE,
            "version": self.VERSION,
            "debug": self.DEBUG,
            "description": self.DESCRIPTION,
            "docs_url": self.DOCS_URL,
            "openapi_url": self.OPENAPI_URL,
            "redoc_url": self.REDOC_URL,
            "openapi_prefix": self.OPENAPI_PREFIX,
            "api_prefix": self.API_PREFIX,
        }

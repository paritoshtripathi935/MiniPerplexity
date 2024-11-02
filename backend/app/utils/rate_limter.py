from functools import wraps
import time
from typing import Callable, Any, Dict
import logging

logger = logging.getLogger(__name__)

class RateLimiter:
    """Rate limiter implementation using token bucket algorithm"""
    
    def __init__(self, calls: int, period: float):
        """Initialize rate limiter.
        
        Args:
            calls: Number of calls allowed per period
            period: Time period in seconds
        """
        self.calls = calls
        self.period = period
        self.tokens: Dict[str, list] = {}  # Store timestamps per function
    
    def _cleanup_old_calls(self, func_name: str) -> None:
        """Remove timestamps older than the time period."""
        if func_name not in self.tokens:
            self.tokens[func_name] = []
            
        current_time = time.time()
        self.tokens[func_name] = [
            timestamp for timestamp in self.tokens[func_name]
            if current_time - timestamp <= self.period
        ]
    
    def can_call(self, func_name: str) -> bool:
        """Check if function can be called based on rate limit.
        
        Args:
            func_name: Name of the function being rate limited
            
        Returns:
            bool: True if call is allowed, False otherwise
        """
        self._cleanup_old_calls(func_name)
        return len(self.tokens[func_name]) < self.calls
    
    def add_call(self, func_name: str) -> None:
        """Record a function call."""
        self.tokens[func_name].append(time.time())
    
    def time_until_available(self, func_name: str) -> float:
        """Calculate time until next call is available.
        
        Args:
            func_name: Name of the function being rate limited
            
        Returns:
            float: Seconds until next call is available
        """
        if self.can_call(func_name):
            return 0.0
            
        oldest_call = min(self.tokens[func_name])
        return oldest_call + self.period - time.time()

def rate_limit(calls: int, period: float) -> Callable:
    """Decorator for rate limiting function calls.
    
    Args:
        calls: Number of calls allowed per period
        period: Time period in seconds
        
    Returns:
        Decorator function
    """
    limiter = RateLimiter(calls, period)
    
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            func_name = func.__name__
            
            while not limiter.can_call(func_name):
                wait_time = limiter.time_until_available(func_name)
                if wait_time > 0:
                    logger.debug(
                        f"Rate limit reached for {func_name}. "
                        f"Waiting {wait_time:.2f} seconds"
                    )
                    time.sleep(wait_time)
            
            limiter.add_call(func_name)
            return func(*args, **kwargs)
        return wrapper
    return decorator

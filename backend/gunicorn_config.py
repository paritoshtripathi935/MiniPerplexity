workers = 4  # Number of worker processes
worker_class = "uvicorn.workers.UvicornWorker"
bind = "0.0.0.0:8000"  # Bind to the appropriate host and port 
workers = 4  # Number of worker processes
worker_class = "uvicorn.workers.UvicornWorker"
bind = "0.0.0.0:8000"  # Bind to the appropriate host and port

# `/answer` regularly does: parallel search providers (~3s) → LLM rerank
# (~1–2s) → main answer generation. With reasoning-tuned models like
# `gpt-oss-120b` or `qwq-32b` the answer step alone can run 15–60s
# (chain-of-thought before the final answer). Gunicorn's default 30s
# timeout was killing requests mid-generation — log evidence:
#   "WORKER TIMEOUT (pid:42)" → "Worker was sent SIGKILL"
# Lift to 120s. Long-tail still gets a clean 504 rather than a 30s SIGKILL.
timeout = 120
graceful_timeout = 30

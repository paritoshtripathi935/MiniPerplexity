from dotenv import load_dotenv
import os
load_dotenv()

CLOUDFLARE_API_KEY = os.getenv("CLOUDFLARE_API_KEY")
CLOUDFLARE_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID")

# ---------- Meta Marketing API (A5) -----------------------------------------
# Meta App credentials. Without these, the /integrations/meta endpoints
# return 503; the rest of the API still works fine. Configure when ready.
META_APP_ID = os.getenv("META_APP_ID")
META_APP_SECRET = os.getenv("META_APP_SECRET")
# Where Meta redirects the user after OAuth consent. Must match the URI
# registered in the Meta App dashboard exactly (including trailing slash).
META_OAUTH_REDIRECT_URI = os.getenv("META_OAUTH_REDIRECT_URI")
# Fernet key for symmetric encryption of OAuth tokens at rest. Generate with
#   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# Rotating this requires every connected user to re-OAuth.
META_TOKEN_SECRET = os.getenv("META_TOKEN_SECRET")
# Graph API version. Pin so a Meta deprecation doesn't break us silently.
META_GRAPH_API_VERSION = os.getenv("META_GRAPH_API_VERSION", "v20.0")

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

# ---------- Object storage (campaign creatives) -----------------------------
# Pluggable backend. Default is UploadThing (free tier, no credit card);
# Cloudflare R2 is also wired up. The abstraction in
# app/services/storage/ keeps the routes provider-agnostic. When env
# vars are missing for the active provider, creatives endpoints return
# 503 — the rest of the API still works.
STORAGE_PROVIDER = os.getenv("STORAGE_PROVIDER", "uploadthing").lower()

# UploadThing — https://uploadthing.com. Two ways to authenticate:
#   - UPLOADTHING_TOKEN: the v7 base64-encoded JSON token from the
#     dashboard (preferred — carries app_id alongside the key, so file
#     URLs use the per-app subdomain).
#   - UPLOADTHING_SECRET: the legacy raw API key ("sk_live_..."). Works,
#     but file URLs fall back to utfs.io shared subdomain.
UPLOADTHING_TOKEN = os.getenv("UPLOADTHING_TOKEN")
UPLOADTHING_SECRET = os.getenv("UPLOADTHING_SECRET")

# R2 (Cloudflare) — S3-compatible alternative. Generate from the R2
# dashboard. Requires a credit card on file with Cloudflare even for
# the free tier; if that's a blocker, stick with UploadThing.
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME")

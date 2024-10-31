from dotenv import load_dotenv
import os
load_dotenv()

CLOUDFLARE_API_KEY = os.getenv("CLOUDFLARE_API_KEY")
CLOUDFLARE_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID")

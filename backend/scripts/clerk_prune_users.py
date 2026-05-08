"""Bulk-delete inactive Clerk users via the Backend API.

The Clerk dashboard only deletes one user at a time. Hitting the 100-user
dev-instance cap is annoying enough that this script pays for itself the
first time you run it.

Usage (from backend/):

    # 1. Dry-run — see who *would* be deleted, no API writes
    python -m scripts.clerk_prune_users --inactive-days 30 --dry-run

    # 2. Real run — delete everyone inactive for 30+ days
    python -m scripts.clerk_prune_users --inactive-days 30

    # Keep specific people regardless of activity
    python -m scripts.clerk_prune_users --inactive-days 30 \
        --keep paritosh.tripathi.work@gmail.com you@example.com

    # Nuke everyone who never signed in (cleanup of orphan signups)
    python -m scripts.clerk_prune_users --never-active

    # The big hammer — keep only the listed emails, delete every other user
    python -m scripts.clerk_prune_users --keep-only paritosh.tripathi.work@gmail.com

Reads CLERK_SECRET_KEY from backend/.env. Works against the dev (`sk_test_…`)
or production (`sk_live_…`) instance — whichever the secret belongs to.
Polite to Clerk's rate limit (~50 req/sec docs limit; we sleep 50ms between
deletes).
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from dotenv import load_dotenv

load_dotenv()

CLERK_API = "https://api.clerk.com/v1"
CLERK_SECRET_KEY = os.getenv("CLERK_SECRET_KEY", "")
PAGE_SIZE = 500            # Clerk caps at 500 per call
DELETE_DELAY_SECONDS = 0.05  # ≈20 deletes/sec — well under the 50/s limit


def _primary_email(user: dict[str, Any]) -> Optional[str]:
    """Return the user's primary email, or any email if none is marked primary."""
    emails = user.get("email_addresses") or []
    if not emails:
        return None
    primary_id = user.get("primary_email_address_id")
    if primary_id:
        for e in emails:
            if e.get("id") == primary_id:
                return e.get("email_address")
    return emails[0].get("email_address")


def _last_active_dt(user: dict[str, Any]) -> Optional[datetime]:
    """Clerk returns last_active_at as epoch milliseconds; convert or None."""
    ts = user.get("last_active_at")
    if not ts:
        return None
    return datetime.fromtimestamp(ts / 1000, tz=timezone.utc)


def _label(user: dict[str, Any]) -> str:
    name_parts = [user.get("first_name") or "", user.get("last_name") or ""]
    name = " ".join(p for p in name_parts if p).strip() or "(no name)"
    email = _primary_email(user) or "(no email)"
    last = _last_active_dt(user)
    last_str = last.isoformat(timespec="seconds") if last else "never"
    return f"{user['id']}  {email:40s}  {name:24s}  last_active={last_str}"


async def _list_all_users(client: httpx.AsyncClient) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    offset = 0
    while True:
        r = await client.get(
            f"{CLERK_API}/users",
            params={"limit": PAGE_SIZE, "offset": offset},
        )
        r.raise_for_status()
        page = r.json()
        if not page:
            break
        out.extend(page)
        if len(page) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    return out


async def _delete(client: httpx.AsyncClient, uid: str) -> tuple[bool, str]:
    try:
        r = await client.delete(f"{CLERK_API}/users/{uid}")
        if r.status_code in (200, 204):
            return True, ""
        return False, f"HTTP {r.status_code}: {r.text[:200]}"
    except httpx.HTTPError as e:
        return False, str(e)


def _make_filter(args: argparse.Namespace) -> tuple[Any, str]:
    """Closure that returns True if a user should be deleted, plus a label."""
    keep = {e.lower() for e in (args.keep or [])}
    keep_only = {e.lower() for e in (args.keep_only or [])} if args.keep_only else None

    if keep_only:
        def f(u: dict[str, Any]) -> bool:
            email = (_primary_email(u) or "").lower()
            return email not in keep_only
        return f, f"everyone except {len(keep_only)} kept email(s)"

    if args.never_active:
        def f(u: dict[str, Any]) -> bool:
            email = (_primary_email(u) or "").lower()
            if email in keep:
                return False
            return _last_active_dt(u) is None
        return f, "users who have never been active"

    if args.inactive_days is not None:
        threshold = datetime.now(tz=timezone.utc).timestamp() - args.inactive_days * 86400

        def f(u: dict[str, Any]) -> bool:
            email = (_primary_email(u) or "").lower()
            if email in keep:
                return False
            last = _last_active_dt(u)
            if last is None:
                return True  # never active counts as inactive
            return last.timestamp() < threshold
        return f, f"users inactive ≥{args.inactive_days} days"

    raise SystemExit("Pick one: --inactive-days N, --never-active, or --keep-only EMAILS")


async def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument("--inactive-days", type=int, help="delete users inactive ≥N days (also counts never-active)")
    g.add_argument("--never-active", action="store_true", help="delete users who have never been active")
    g.add_argument("--keep-only", nargs="+", metavar="EMAIL",
                   help="delete every user whose primary email is NOT in this list")
    p.add_argument("--keep", nargs="+", metavar="EMAIL", help="emails to preserve regardless of activity")
    p.add_argument("--dry-run", action="store_true", help="print what would happen, don't delete")
    p.add_argument("--yes", action="store_true", help="skip the confirmation prompt")
    args = p.parse_args(argv)

    if not CLERK_SECRET_KEY:
        print("✗ CLERK_SECRET_KEY missing from backend/.env", file=sys.stderr)
        return 1

    headers = {"Authorization": f"Bearer {CLERK_SECRET_KEY}"}
    instance = "production" if CLERK_SECRET_KEY.startswith("sk_live_") else "development"
    print(f"→ Clerk instance: {instance}")

    matches_filter, filter_label = _make_filter(args)

    async with httpx.AsyncClient(headers=headers, timeout=30.0) as client:
        print(f"→ Listing users…")
        users = await _list_all_users(client)
        print(f"→ {len(users)} total users")

        targets = [u for u in users if matches_filter(u)]
        print(f"→ {len(targets)} match: {filter_label}")
        if not targets:
            return 0

        for u in targets:
            print(f"   - {_label(u)}")

        if args.dry_run:
            print("\nDry-run — nothing deleted. Re-run without --dry-run to actually prune.")
            return 0

        if not args.yes:
            confirm = input(f"\nDelete {len(targets)} users? Type 'yes' to confirm: ")
            if confirm.strip().lower() != "yes":
                print("Aborted.")
                return 0

        print()
        ok = 0
        fail = 0
        for i, u in enumerate(targets, 1):
            success, err = await _delete(client, u["id"])
            email = _primary_email(u) or u["id"]
            if success:
                ok += 1
                print(f"  [{i:>3}/{len(targets)}] ✓ {email}")
            else:
                fail += 1
                print(f"  [{i:>3}/{len(targets)}] ✗ {email} — {err}")
            await asyncio.sleep(DELETE_DELAY_SECONDS)

        print(f"\n✓ Deleted {ok}{f' ({fail} failed)' if fail else ''}.")
        return 0 if fail == 0 else 2


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1:])))

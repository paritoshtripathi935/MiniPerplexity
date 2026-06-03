"""Side-by-side eval harness for web-search providers.

Runs a list of queries through every configured provider and writes a JSON
report so we can compare apples-to-apples:

  - latency_ms     wall time per provider call
  - result_count   how many results came back
  - total_chars    summed length of `search_content` (proxy for body the LLM
                   gets to ground on)
  - urls           list of returned URLs (manual sanity check)
  - titles         list of titles (manual sanity check)
  - error          provider's error message if the call blew up

Usage (from repo root):

  cd backend && source venv/bin/activate
  python scripts/eval_search_providers.py \
      --queries "how to ramp meta abo budgets in q4" \
                "lifecycle email cadence for warm leads" \
      --providers google anakin \
      --out /tmp/search-eval.json

  # Or pass a file with one query per line:
  python scripts/eval_search_providers.py \
      --queries-file scripts/eval_queries.txt \
      --providers google anakin \
      --out /tmp/search-eval.json

Required env vars: GOOGLE_API_KEY, GOOGLE_SEARCH_CX (for google); ANAKIN_API_KEY
(for anakin). Falls back to the same .env the backend uses if dotenv is set up.

The harness does NOT call the LLM — that's a separate downstream eval. This is
just the search-layer comparison so we can isolate "did Anakin give us better
candidates" from "did the LLM ranker pick well".
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List

# Make `app.*` importable when invoked from the backend dir.
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

try:  # optional .env loading — matches the rest of the backend
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env")
except Exception:
    pass

from app.services.search_providers import (  # noqa: E402
    SearchProviderError,
    get_provider,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("eval")


def run_one(provider_name: str, query: str) -> Dict[str, Any]:
    """Run a single (provider, query) combo and return a JSON-safe row."""
    start = time.monotonic()
    try:
        provider = get_provider(override=provider_name)
        results = provider.search(query)
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return {
            "provider": provider_name,
            "query": query,
            "latency_ms": elapsed_ms,
            "result_count": len(results),
            "total_chars": sum(len(r.search_content or "") for r in results),
            "urls": [r.url for r in results],
            "titles": [r.title for r in results],
            "snippet_sample": [r.snippet[:120] for r in results[:3]],
            "content_sample": [r.search_content[:200] for r in results[:3]],
            "error": None,
        }
    except SearchProviderError as e:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return {
            "provider": provider_name,
            "query": query,
            "latency_ms": elapsed_ms,
            "result_count": 0,
            "total_chars": 0,
            "urls": [],
            "titles": [],
            "snippet_sample": [],
            "content_sample": [],
            "error": f"SearchProviderError: {e}",
        }
    except Exception as e:  # surface everything — this is an eval, not prod
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return {
            "provider": provider_name,
            "query": query,
            "latency_ms": elapsed_ms,
            "result_count": 0,
            "total_chars": 0,
            "urls": [],
            "titles": [],
            "snippet_sample": [],
            "content_sample": [],
            "error": f"{type(e).__name__}: {e}",
        }


def summarize(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Per-provider rollup so the user can eyeball the headline numbers
    without reading every row."""
    by_provider: Dict[str, List[Dict[str, Any]]] = {}
    for r in rows:
        by_provider.setdefault(r["provider"], []).append(r)

    summary = {}
    for prov, rs in by_provider.items():
        ok = [r for r in rs if not r["error"]]
        summary[prov] = {
            "queries": len(rs),
            "successful": len(ok),
            "failed": len(rs) - len(ok),
            "avg_latency_ms": (
                round(sum(r["latency_ms"] for r in ok) / len(ok)) if ok else None
            ),
            "avg_result_count": (
                round(sum(r["result_count"] for r in ok) / len(ok), 2) if ok else None
            ),
            "avg_total_chars": (
                round(sum(r["total_chars"] for r in ok) / len(ok)) if ok else None
            ),
        }
    return summary


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--queries", nargs="+", help="One or more queries (alternative to --queries-file)")
    p.add_argument("--queries-file", help="File with one query per line (# comments allowed)")
    p.add_argument(
        "--providers",
        nargs="+",
        default=["google", "anakin"],
        help="Provider names to compare. Default: google anakin",
    )
    p.add_argument("--out", required=True, help="Where to write the JSON report")
    args = p.parse_args()

    queries: List[str] = []
    if args.queries:
        queries.extend(args.queries)
    if args.queries_file:
        with open(args.queries_file) as f:
            for raw in f:
                line = raw.strip()
                if not line or line.startswith("#"):
                    continue
                queries.append(line)
    if not queries:
        log.error("no queries supplied — use --queries or --queries-file")
        return 2

    log.info(
        "eval: %d quer%s × %d provider%s",
        len(queries),
        "y" if len(queries) == 1 else "ies",
        len(args.providers),
        "" if len(args.providers) == 1 else "s",
    )

    rows: List[Dict[str, Any]] = []
    for q in queries:
        for prov in args.providers:
            log.info("→ %s :: %s", prov, q[:80])
            row = run_one(prov, q)
            log.info(
                "← %s :: %d ms · %d results · %d chars%s",
                prov,
                row["latency_ms"],
                row["result_count"],
                row["total_chars"],
                f" · ERROR {row['error']}" if row["error"] else "",
            )
            rows.append(row)

    report = {
        "queries": queries,
        "providers": args.providers,
        "summary": summarize(rows),
        "rows": rows,
    }

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w") as f:
        json.dump(report, f, indent=2)
    log.info("wrote %s", out)

    # Friendly console summary so you don't have to open the JSON for the
    # headline numbers.
    print()
    print("─" * 60)
    print("SUMMARY")
    print("─" * 60)
    for prov, stats in report["summary"].items():
        print(f"{prov:>10}  |  "
              f"{stats['successful']}/{stats['queries']} ok  |  "
              f"avg {stats['avg_latency_ms']} ms  |  "
              f"avg {stats['avg_result_count']} results  |  "
              f"avg {stats['avg_total_chars']} chars")
    print("─" * 60)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

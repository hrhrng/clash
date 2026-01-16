"""
Cloudflare D1 Database Service.

Provides async interface to D1 via HTTP API.
"""

import asyncio
import logging
from typing import Any

import httpx

from master_clash.config import get_settings

logger = logging.getLogger(__name__)


async def _post_with_retries(
    client: httpx.AsyncClient,
    url: str,
    headers: dict[str, str],
    payload: dict[str, Any],
    timeout: float,
    attempts: int = 3,
) -> httpx.Response:
    last_exc: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            response = await client.post(
                url,
                headers=headers,
                json=payload,
                timeout=timeout,
            )
            if response.status_code in {429} or response.status_code >= 500:
                if attempt < attempts:
                    backoff = 0.5 * (2 ** (attempt - 1))
                    logger.warning(
                        "[D1] Retrying after HTTP %s (attempt %s/%s)",
                        response.status_code,
                        attempt,
                        attempts,
                    )
                    await asyncio.sleep(backoff)
                    continue
            return response
        except httpx.RequestError as exc:
            last_exc = exc
            if attempt >= attempts:
                raise
            backoff = 0.5 * (2 ** (attempt - 1))
            logger.warning(
                "[D1] Retrying after request error %s (attempt %s/%s)",
                exc.__class__.__name__,
                attempt,
                attempts,
            )
            await asyncio.sleep(backoff)
    if last_exc:
        raise last_exc
    raise RuntimeError("D1 request failed without response")


async def execute(sql: str, params: list = None) -> dict:
    """
    Execute SQL on Cloudflare D1 via HTTP API.
    
    Args:
        sql: SQL statement
        params: Optional query parameters
        
    Returns:
        Query result dict
    """
    settings = get_settings()
    
    if not settings.cloudflare_account_id or not settings.cloudflare_d1_database_id:
        raise ValueError("Cloudflare D1 not configured")
    
    url = (
        f"https://api.cloudflare.com/client/v4/accounts/"
        f"{settings.cloudflare_account_id}/d1/database/"
        f"{settings.cloudflare_d1_database_id}/query"
    )
    
    async with httpx.AsyncClient() as client:
        response = await _post_with_retries(
            client=client,
            url=url,
            headers={
                "Authorization": f"Bearer {settings.cloudflare_api_token}",
                "Content-Type": "application/json",
            },
            payload={"sql": sql, "params": params or []},
            timeout=30.0,
        )
        
        if response.status_code != 200:
            error_body = response.text
            logger.error(f"[D1] Query failed with {response.status_code}: SQL={sql}, Params={params}, Response={error_body}")
            raise Exception(f"D1 query failed: {response.status_code} - {error_body}")
        
        result = response.json()
        if not result.get("success"):
            logger.error(f"[D1] Query error: {result}")
            raise Exception(f"D1 query error: {result.get('errors')}")
        
        return result


async def query_one(sql: str, params: list = None) -> dict | None:
    """Execute query and return first result row."""
    result = await execute(sql, params)
    results = result.get("result", [{}])[0].get("results", [])
    return results[0] if results else None


async def query_all(sql: str, params: list = None) -> list[dict]:
    """Execute query and return all result rows."""
    result = await execute(sql, params)
    return result.get("result", [{}])[0].get("results", [])

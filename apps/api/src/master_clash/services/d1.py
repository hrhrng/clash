"""
Cloudflare D1 Database Service.

Provides async interface to D1 via HTTP API.
"""

import json
import logging
from typing import Any

import httpx

from master_clash.config import get_settings

logger = logging.getLogger(__name__)


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
        response = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {settings.cloudflare_api_token}",
                "Content-Type": "application/json",
            },
            json={"sql": sql, "params": params or []},
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

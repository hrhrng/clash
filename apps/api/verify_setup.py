import os
import asyncio
import json
import httpx
from master_clash.config import settings

async def verify_d1():
    print("Verifying D1 connection...")
    if not settings.cloudflare_api_token:
        print("❌ Cloudflare API Token not set")
        return False
    
    account_id = settings.cloudflare_account_id
    database_id = settings.cloudflare_d1_database_id
    
    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{database_id}/query"
    headers = {
        "Authorization": f"Bearer {settings.cloudflare_api_token}",
        "Content-Type": "application/json"
    }
    payload = {
        "sql": "SELECT name FROM sqlite_master WHERE type='table'",
        "params": []
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
            if data["success"]:
                print("✅ D1 connection successful")
                print("Tables:", [row["name"] for row in data["result"][0]["results"]])
                return True
            else:
                print(f"❌ D1 connection failed: {data['errors']}")
                return False
    except Exception as e:
        print(f"❌ D1 connection error: {e}")
        return False

async def verify_r2():
    print("\nVerifying R2 connection...")
    # This requires boto3 which might not be installed in the environment if not used directly
    # But we can check if env vars are set
    if not settings.r2_access_key_id or not settings.r2_secret_access_key:
        print("❌ R2 credentials not set")
        return False
        
    print("✅ R2 credentials present")
    print(f"Bucket: {settings.r2_bucket_name}")
    print(f"Public URL: {settings.r2_public_url}")
    return True

async def main():
    d1_ok = await verify_d1()
    r2_ok = await verify_r2()
    
    if d1_ok and r2_ok:
        print("\n🎉 All checks passed!")
    else:
        print("\n⚠️ Some checks failed.")

if __name__ == "__main__":
    asyncio.run(main())


import json
import os

key_path = "/Users/xiaoyang/Proj/clash/service-account.json"
vars_path = "/Users/xiaoyang/Proj/clash/apps/loro-sync-server/.dev.vars"

with open(key_path, "r") as f:
    key_data = json.load(f)

client_email = key_data["client_email"]
private_key = key_data["private_key"]
# Escape newlines for .env/dotenv format if needed, but python-dotenv usually handles quoted newlines.
# For .dev.vars (wrangler), it works best if the value is quoted and newlines are literal \n or actual newlines?
# Usually "PRIVATE_KEY" works. Let's try inserting it as a single line with \n escaped.
escaped_key = private_key.replace('\n', '\\n')

print(f"Email: {client_email}")
# print(f"Key: {escaped_key[:20]}...")

# Read existing vars to avoid duplicates (or just append)
content = ""
if os.path.exists(vars_path):
    with open(vars_path, "r") as f:
        content = f.read()

# Remove old keys if present (simple check)
lines = content.splitlines()
new_lines = []
for line in lines:
    if not line.startswith("GCP_CLIENT_EMAIL=") and not line.startswith("GCP_PRIVATE_KEY="):
        new_lines.append(line)

new_lines.append(f'GCP_CLIENT_EMAIL="{client_email}"')
new_lines.append(f'GCP_PRIVATE_KEY="{escaped_key}"')

with open(vars_path, "w") as f:
    f.write("\n".join(new_lines) + "\n")

print("Updated .dev.vars")

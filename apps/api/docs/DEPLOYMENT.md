# Deployment Guide

This guide covers how to deploy master-clash in different environments and manage environment variables securely.

## Table of Contents

- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Production Deployment](#production-deployment)
  - [Docker Deployment](#docker-deployment)
  - [Cloud Platforms](#cloud-platforms)
  - [Traditional VPS](#traditional-vps)
- [CI/CD Integration](#cicd-integration)
- [Security Best Practices](#security-best-practices)

---

## Quick Start

### 1. Clone and Setup

```bash
git clone <your-repo-url>
cd master-clash

# Copy environment template
cp .env.example .env

# Edit .env with your actual values
nano .env  # or use your preferred editor
```

### 2. Install Dependencies

```bash
# Using uv (recommended)
uv sync

# Or using pip
pip install -e .
```

### 3. Run the Application

```bash
# Development mode
python -m master_clash

# Or using your main script
uv run python src/master_clash/main.py
```

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ENVIRONMENT` | Environment name | `development` |
| `DEBUG` | Enable debug mode | `false` |
| `ANTHROPIC_API_KEY` | Claude API key | - |
| `DATABASE_URL` | Database connection | - |
| `OUTPUT_DIR` | Output directory | `./output` |
| `ASSETS_DIR` | Assets directory | `./assets` |
| `MAX_WORKERS` | Concurrent workers | `4` |
| `LOG_LEVEL` | Logging level | `INFO` |

See [.env.example](.env.example) for the complete list.

---

## Local Development

### Using .env File

1. Create `.env` from template:
   ```bash
   cp .env.example .env
   ```

2. Add your credentials:
   ```env
   ENVIRONMENT=development
   DEBUG=true
   OPENAI_API_KEY=sk-your-dev-key
   ```

3. The application will automatically load these variables via `python-dotenv`.

### Testing Configuration

```python
from master_clash.config import get_settings

settings = get_settings()
print(f"Environment: {settings.environment}")
print(f"Debug: {settings.debug}")
```

Or run the config module directly:
```bash
uv run python src/master_clash/config.py
```

---

## Production Deployment

**⚠️ NEVER commit .env files or hard-code secrets in production!**

### Docker Deployment

#### Option 1: Environment Variables in docker-compose.yml

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    environment:
      - ENVIRONMENT=production
      - DEBUG=false
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - DATABASE_URL=${DATABASE_URL}
    volumes:
      - ./output:/app/output
      - ./assets:/app/assets
```

Run with:
```bash
# Set variables in shell
export OPENAI_API_KEY=sk-prod-xxx
export DATABASE_URL=postgresql://...

# Deploy
docker-compose up -d
```

#### Option 2: Docker Secrets (Recommended for Swarm)

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    secrets:
      - openai_api_key
      - database_url
    environment:
      - OPENAI_API_KEY_FILE=/run/secrets/openai_api_key
      - DATABASE_URL_FILE=/run/secrets/database_url

secrets:
  openai_api_key:
    external: true
  database_url:
    external: true
```

### Cloud Platforms

#### AWS (ECS/EC2/Lambda)

**Option 1: AWS Secrets Manager (Recommended)**

```python
# Install AWS SDK
# pip install boto3

import boto3
import json

def get_secret(secret_name):
    client = boto3.client('secrets-manager', region_name='us-east-1')
    response = client.get_secret_value(SecretId=secret_name)
    return json.loads(response['SecretString'])

# Use in your app
secrets = get_secret('master-clash/prod')
os.environ['OPENAI_API_KEY'] = secrets['openai_api_key']
```

**Option 2: Environment Variables in ECS Task Definition**

```json
{
  "containerDefinitions": [{
    "name": "master-clash",
    "environment": [
      {"name": "ENVIRONMENT", "value": "production"},
      {"name": "DEBUG", "value": "false"}
    ],
    "secrets": [
      {
        "name": "OPENAI_API_KEY",
        "valueFrom": "arn:aws:secretsmanager:region:account:secret:openai-key"
      }
    ]
  }]
}
```

**Option 3: Systems Manager Parameter Store**

```bash
# Store parameters
aws ssm put-parameter \
  --name "/master-clash/prod/openai-api-key" \
  --value "sk-xxx" \
  --type "SecureString"

# Retrieve in application
aws ssm get-parameter \
  --name "/master-clash/prod/openai-api-key" \
  --with-decryption
```

#### Google Cloud (Cloud Run/GKE)

**Cloud Run:**
```bash
# Deploy with environment variables
gcloud run deploy master-clash \
  --image gcr.io/project/master-clash \
  --set-env-vars ENVIRONMENT=production \
  --set-env-vars DEBUG=false \
  --update-secrets OPENAI_API_KEY=openai-key:latest
```

**Secret Manager:**
```bash
# Create secret
gcloud secrets create openai-api-key \
  --data-file=- <<< "sk-xxx"

# Grant access
gcloud secrets add-iam-policy-binding openai-api-key \
  --member="serviceAccount:PROJECT@appspot.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

#### Azure (App Service/Container Instances)

**App Service:**
```bash
# Set environment variables
az webapp config appsettings set \
  --resource-group myResourceGroup \
  --name master-clash \
  --settings OPENAI_API_KEY=sk-xxx ENVIRONMENT=production
```

**Key Vault:**
```bash
# Create secret
az keyvault secret set \
  --vault-name myKeyVault \
  --name openai-api-key \
  --value "sk-xxx"

# Reference in App Service
@Microsoft.KeyVault(SecretUri=https://mykeyvault.vault.azure.net/secrets/openai-api-key/)
```

#### Platform-as-a-Service (Vercel, Railway, Render)

**Railway:**
1. Go to project settings
2. Click "Variables"
3. Add `OPENAI_API_KEY` and other variables
4. Deploy

**Render:**
```yaml
# render.yaml
services:
  - type: web
    name: master-clash
    env: python
    envVars:
      - key: ENVIRONMENT
        value: production
      - key: OPENAI_API_KEY
        sync: false  # Managed in dashboard
```

### Kubernetes

```yaml
# secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: master-clash-secrets
type: Opaque
stringData:
  openai-api-key: "sk-xxx"
  database-url: "postgresql://..."
---
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: master-clash
spec:
  template:
    spec:
      containers:
      - name: master-clash
        image: master-clash:latest
        env:
          - name: ENVIRONMENT
            value: "production"
          - name: OPENAI_API_KEY
            valueFrom:
              secretKeyRef:
                name: master-clash-secrets
                key: openai-api-key
          - name: DATABASE_URL
            valueFrom:
              secretKeyRef:
                name: master-clash-secrets
                key: database-url
```

Apply secrets:
```bash
# Create secret (base64 encoded)
kubectl create secret generic master-clash-secrets \
  --from-literal=openai-api-key=sk-xxx \
  --from-literal=database-url=postgresql://...

# Or from file
kubectl create secret generic master-clash-secrets \
  --from-env-file=.env.production

# Deploy
kubectl apply -f deployment.yaml
```

### Traditional VPS/Dedicated Server

#### Option 1: System Environment Variables

```bash
# Add to /etc/environment or ~/.bashrc
export ENVIRONMENT=production
export DEBUG=false
export OPENAI_API_KEY=sk-xxx
export DATABASE_URL=postgresql://...

# Load environment
source ~/.bashrc

# Run application
python -m master_clash
```

#### Option 2: Systemd Service

```ini
# /etc/systemd/system/master-clash.service
[Unit]
Description=Master Clash Application
After=network.target

[Service]
Type=simple
User=appuser
WorkingDirectory=/opt/master-clash
Environment="ENVIRONMENT=production"
Environment="DEBUG=false"
Environment="OPENAI_API_KEY=sk-xxx"
Environment="DATABASE_URL=postgresql://..."
ExecStart=/opt/master-clash/.venv/bin/python -m master_clash
Restart=always

[Install]
WantedBy=multi-user.target
```

Start service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable master-clash
sudo systemctl start master-clash
```

#### Option 3: Environment File (More Secure)

```bash
# Create secure env file
sudo mkdir -p /etc/master-clash
sudo touch /etc/master-clash/environment
sudo chmod 600 /etc/master-clash/environment

# Add variables
sudo nano /etc/master-clash/environment
```

```ini
# /etc/master-clash/environment
ENVIRONMENT=production
DEBUG=false
OPENAI_API_KEY=sk-xxx
DATABASE_URL=postgresql://...
```

Update systemd service:
```ini
[Service]
EnvironmentFile=/etc/master-clash/environment
```

---

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'

      - name: Install uv
        run: pip install uv

      - name: Install dependencies
        run: uv sync

      - name: Run tests
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          ENVIRONMENT: testing
        run: uv run pytest

      - name: Deploy to production
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        run: |
          # Your deployment script
          ./deploy.sh
```

**Setting GitHub Secrets:**
1. Go to repository Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Add each secret (OPENAI_API_KEY, DATABASE_URL, etc.)

### GitLab CI

```yaml
# .gitlab-ci.yml
deploy:production:
  stage: deploy
  environment:
    name: production
  variables:
    ENVIRONMENT: production
    DEBUG: "false"
  script:
    - echo "Deploying to production..."
    - # Your deployment commands
  only:
    - main
```

**Setting GitLab Variables:**
1. Go to Settings → CI/CD → Variables
2. Add variables and mark as "Protected" and "Masked"

---

## Security Best Practices

### ✅ DO

1. **Use environment variables** for all secrets
2. **Never commit** `.env` files to version control
3. **Use secret management services** in production (AWS Secrets Manager, etc.)
4. **Rotate keys regularly** and have a rotation strategy
5. **Use different keys** for different environments
6. **Limit permissions** - principle of least privilege
7. **Encrypt secrets** in CI/CD pipelines
8. **Audit access** to secrets regularly
9. **Use HTTPS/TLS** for all API communications
10. **Monitor for leaked secrets** (use tools like git-secrets, truffleHog)

### ❌ DON'T

1. **Never hard-code** secrets in code
2. **Never commit** `.env` to Git
3. **Never share** production keys in chat/email
4. **Never use production keys** in development
5. **Never log** sensitive values
6. **Never expose** secrets in error messages
7. **Never use weak** or default passwords
8. **Don't store secrets** in container images

### Checking for Leaked Secrets

```bash
# Install git-secrets
brew install git-secrets  # macOS
# or
apt-get install git-secrets  # Linux

# Initialize in repository
git secrets --install
git secrets --register-aws

# Scan for secrets
git secrets --scan

# Prevent committing secrets
git secrets --add 'sk-[a-zA-Z0-9]{48}'
git secrets --add 'OPENAI_API_KEY.*'
```

### Secret Rotation

```python
# Example: Implement graceful secret rotation
class APIClient:
    def __init__(self):
        self.primary_key = os.getenv("OPENAI_API_KEY")
        self.fallback_key = os.getenv("OPENAI_API_KEY_FALLBACK")

    def call_api(self):
        try:
            return self._call_with_key(self.primary_key)
        except AuthError:
            # Fallback to old key during rotation
            return self._call_with_key(self.fallback_key)
```

---

## Environment-Specific Configurations

### Development
```env
ENVIRONMENT=development
DEBUG=true
LOG_LEVEL=DEBUG
ENABLE_CACHE=false
```

### Staging
```env
ENVIRONMENT=staging
DEBUG=false
LOG_LEVEL=INFO
ENABLE_CACHE=true
```

### Production
```env
ENVIRONMENT=production
DEBUG=false
LOG_LEVEL=WARNING
ENABLE_CACHE=true
ENABLE_TELEMETRY=true
```

---

## Troubleshooting

### Configuration Not Loading

```bash
# Test configuration loading
uv run python src/master_clash/config.py

# Check environment variables
env | grep OPENAI
```

### Missing Required Variables

If you see `ValidationError`, ensure all required variables are set:
```
pydantic_core._pydantic_core.ValidationError: 1 validation error for Settings
openai_api_key
  Field required [type=missing, input_value={...}, input_type=dict]
```

Solution: Set `OPENAI_API_KEY` in your environment or `.env` file.

### Permission Denied

```bash
# Fix file permissions
chmod 600 .env
chmod 600 /etc/master-clash/environment
```

---

## Further Reading

- [Pydantic Settings Documentation](https://docs.pydantic.dev/latest/concepts/pydantic_settings/)
- [12-Factor App: Config](https://12factor.net/config)
- [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/)
- [Google Secret Manager](https://cloud.google.com/secret-manager)
- [Azure Key Vault](https://azure.microsoft.com/en-us/services/key-vault/)

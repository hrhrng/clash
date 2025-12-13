# Environment Setup Quick Guide

Quick reference for setting up environment variables in master-clash.

## Local Development Setup

### 1. Create Your `.env` File

```bash
cp .env.example .env
```

### 2. Edit `.env` with Your Values

```bash
# Use your preferred editor
nano .env
# or
code .env
# or
vim .env
```

Minimum required configuration:
```env
OPENAI_API_KEY=sk-your-actual-key-here
```

### 3. Test Configuration

```bash
# Test if configuration loads correctly
uv run python src/master_clash/config.py

# Or use Python directly
uv run python -c "from master_clash.config import get_settings; print(get_settings())"
```

## Using the Configuration in Code

### Basic Usage

```python
from master_clash.config import get_settings

# Get settings instance
settings = get_settings()

# Access configuration
api_key = settings.openai_api_key
debug_mode = settings.debug
output_path = settings.output_dir
```

### Advanced Usage

```python
from master_clash.config import get_settings, reload_settings

settings = get_settings()

# Check environment
if settings.is_production:
    print("Running in production mode")
elif settings.is_development:
    print("Running in development mode")

# Ensure directories exist
settings.ensure_directories()

# Type-safe access
max_workers: int = settings.max_workers
log_level: str = settings.log_level

# Optional values with defaults
anthropic_key = settings.anthropic_api_key or "not-configured"

# Reload settings (useful in tests)
new_settings = reload_settings()
```

## Production Environment Variables

### Cloud Platform Examples

#### Railway
```bash
# In Railway dashboard, add these environment variables:
ENVIRONMENT=production
OPENAI_API_KEY=sk-prod-xxx
DEBUG=false
```

#### Render
```bash
# In Render dashboard → Environment:
ENVIRONMENT=production
OPENAI_API_KEY=sk-prod-xxx
LOG_LEVEL=WARNING
```

#### Heroku
```bash
heroku config:set ENVIRONMENT=production
heroku config:set OPENAI_API_KEY=sk-prod-xxx
heroku config:set DEBUG=false
```

#### AWS Elastic Beanstalk
```bash
eb setenv ENVIRONMENT=production \
  OPENAI_API_KEY=sk-prod-xxx \
  DEBUG=false
```

### Docker

```bash
# Run with environment variables
docker run -d \
  -e ENVIRONMENT=production \
  -e OPENAI_API_KEY=sk-prod-xxx \
  -e DEBUG=false \
  -v $(pwd)/output:/app/output \
  master-clash:latest

# Or use docker-compose
export OPENAI_API_KEY=sk-prod-xxx
docker-compose up -d
```

### Traditional Server

```bash
# Add to ~/.bashrc or /etc/environment
export ENVIRONMENT=production
export OPENAI_API_KEY=sk-prod-xxx
export DEBUG=false

# Load environment
source ~/.bashrc

# Run application
python -m master_clash
```

## Environment Variables Reference

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` |

### Recommended

| Variable | Description | Default |
|----------|-------------|---------|
| `ENVIRONMENT` | Environment name | `development` |
| `DEBUG` | Debug mode | `false` |
| `LOG_LEVEL` | Logging level | `INFO` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Claude API key | `None` |
| `DATABASE_URL` | Database URL | `None` |
| `OUTPUT_DIR` | Output directory | `./output` |
| `ASSETS_DIR` | Assets directory | `./assets` |
| `MAX_WORKERS` | Max workers | `4` |
| `ENABLE_CACHE` | Enable caching | `true` |

See [.env.example](../.env.example) for complete list.

## Troubleshooting

### Error: "Field required" for openai_api_key

**Problem:**
```
pydantic_core._pydantic_core.ValidationError: 1 validation error for Settings
openai_api_key
  Field required
```

**Solution:**
Make sure `OPENAI_API_KEY` is set in your `.env` file or environment:
```bash
export OPENAI_API_KEY=sk-your-key
```

### .env File Not Loading

**Problem:** Variables in `.env` are not being loaded.

**Solution:**
1. Ensure `.env` is in the project root directory
2. Check file permissions: `chmod 600 .env`
3. Verify no typos in variable names
4. Make sure you're running from the project root

### Environment Variables Not Overriding .env

By default, environment variables take precedence over `.env` file values.

```bash
# This will override the value in .env
export DEBUG=true
python -m master_clash
```

### Testing Configuration

```python
# test_config.py
import os
from master_clash.config import reload_settings

def test_config():
    # Set test environment
    os.environ['OPENAI_API_KEY'] = 'sk-test'
    os.environ['ENVIRONMENT'] = 'testing'

    # Reload to pick up changes
    settings = reload_settings()

    assert settings.openai_api_key == 'sk-test'
    assert settings.environment == 'testing'
    print("✓ Configuration loaded correctly")

if __name__ == "__main__":
    test_config()
```

## Security Checklist

- [ ] `.env` is in `.gitignore`
- [ ] Never commit `.env` files
- [ ] Use different keys for dev/staging/prod
- [ ] Rotate keys regularly
- [ ] Use secret management in production
- [ ] Set restrictive file permissions (`chmod 600 .env`)
- [ ] Never log sensitive values
- [ ] Review code for hardcoded secrets

## Next Steps

- Read full [Deployment Guide](DEPLOYMENT.md)
- Set up CI/CD with GitHub Actions
- Configure production secret management
- Set up monitoring and logging

## Getting Help

If you encounter issues:

1. Check [DEPLOYMENT.md](DEPLOYMENT.md) for detailed guides
2. Run diagnostic: `uv run python src/master_clash/config.py`
3. Verify `.env` format matches `.env.example`
4. Check file permissions: `ls -la .env`

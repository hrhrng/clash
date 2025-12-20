#!/bin/bash
# Quick start script for loro-sync-server local development

echo "🚀 Starting loro-sync-server..."
echo ""
echo "📍 Server will be available at: http://localhost:8787"
echo "📚 Endpoints:"
echo "  - GET  /health"
echo "  - POST /tasks"
echo "  - GET  /tasks/:taskId"
echo "  - POST /webhooks/:service"
echo "  - WS   /sync/:projectId"
echo ""
echo "💡 Tips:"
echo "  - Edit .dev.vars to add AIGC API keys"
echo "  - Use Ctrl+C to stop the server"
echo ""

export GOOGLE_APPLICATION_CREDENTIALS="/Users/xiaoyang/Proj/clash/service-account.json"
npx wrangler dev --port 8787

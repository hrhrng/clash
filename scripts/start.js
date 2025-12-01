const { spawn } = require('child_process');
const path = require('path');

// Configuration
const FRONTEND_PORT = process.env.FRONTEND_PORT || 3000;
const BACKEND_PORT = process.env.BACKEND_PORT || 8000;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;

console.log('\x1b[36m%s\x1b[0m', '=== Master Clash Startup ===');
console.log(`Frontend Port: ${FRONTEND_PORT}`);
console.log(`Backend Port: ${BACKEND_PORT}`);
console.log(`Backend URL: ${BACKEND_URL}`);
console.log('----------------------------');

// Environment variables for child processes
const env = {
    ...process.env,
    NEXT_PUBLIC_API_URL: BACKEND_URL,
    PORT: FRONTEND_PORT, // For Next.js
};

// Start Backend
console.log('\x1b[34m%s\x1b[0m', 'Starting Backend...');
const backend = spawn('uv', ['run', 'uvicorn', 'master_clash.api.main:app', '--reload', '--host', '0.0.0.0', '--port', BACKEND_PORT], {
    cwd: path.join(__dirname, '../backend'),
    env: {
        ...env,
        PORT: BACKEND_PORT,
        FRONTEND_URL: `http://localhost:${FRONTEND_PORT}`,
        DEFAULT_CALLBACK_URL: `http://localhost:${FRONTEND_PORT}/api/internal/assets/update`
    },
    stdio: 'inherit',
    shell: true
});

// Start Frontend
console.log('\x1b[35m%s\x1b[0m', 'Starting Frontend...');
const frontend = spawn('npm', ['run', 'dev'], {
    cwd: path.join(__dirname, '../frontend'),
    env: env,
    stdio: 'inherit',
    shell: true
});

// Handle shutdown
const shutdown = () => {
    console.log('\n\x1b[31m%s\x1b[0m', 'Shutting down...');
    backend.kill();
    frontend.kill();
    process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

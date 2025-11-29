#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function exec(command, options = {}) {
  try {
    execSync(command, { stdio: 'inherit', ...options });
    return true;
  } catch (error) {
    return false;
  }
}

function checkCommand(command, name) {
  try {
    execSync(`${command} --version`, { stdio: 'ignore' });
    log(`✓ ${name} is installed`, colors.green);
    return true;
  } catch {
    log(`✗ ${name} is not installed`, colors.red);
    return false;
  }
}

async function main() {
  log('\n🚀 Master Clash Setup\n', colors.blue);

  // Check prerequisites
  log('Checking prerequisites...', colors.yellow);
  const hasNode = checkCommand('node', 'Node.js');
  const hasPython = checkCommand('python3', 'Python 3');
  const hasWrangler = checkCommand('wrangler', 'Wrangler CLI');

  if (!hasNode || !hasPython) {
    log('\n❌ Missing required dependencies. Please install them first.', colors.red);
    process.exit(1);
  }

  if (!hasWrangler) {
    log('\nInstalling Wrangler CLI globally...', colors.yellow);
    exec('npm install -g wrangler');
  }

  // Setup frontend
  log('\n📦 Installing frontend dependencies...', colors.yellow);
  exec('cd frontend && npm install');

  // Setup backend
  log('\n🐍 Setting up Python backend...', colors.yellow);

  // Check for uv (modern Python package manager)
  const hasUv = checkCommand('uv', 'uv');

  if (hasUv) {
    log('Using uv for Python setup...', colors.green);
    exec('cd backend && uv venv');
    exec('cd backend && uv pip install -e ".[dev]"');
  } else {
    log('Using pip for Python setup...', colors.yellow);
    exec('cd backend && python3 -m venv .venv');
    const pipCommand = process.platform === 'win32'
      ? 'cd backend && .\\.venv\\Scripts\\pip install -e ".[dev]"'
      : 'cd backend && .venv/bin/pip install -e ".[dev]"';
    exec(pipCommand);
  }

  // Create environment files
  log('\n📝 Creating environment files...', colors.yellow);

  const rootEnv = path.join(__dirname, '..', '.env');
  const rootEnvExample = path.join(__dirname, '..', '.env.example');
  if (!fs.existsSync(rootEnv) && fs.existsSync(rootEnvExample)) {
    fs.copyFileSync(rootEnvExample, rootEnv);
    log('Created root .env file', colors.green);
  }

  const frontendEnv = path.join(__dirname, '..', 'frontend', '.env');
  const frontendEnvExample = path.join(__dirname, '..', 'frontend', '.env.example');
  if (!fs.existsSync(frontendEnv) && fs.existsSync(frontendEnvExample)) {
    fs.copyFileSync(frontendEnvExample, frontendEnv);
    log('Created frontend/.env file', colors.green);
  }

  const backendEnv = path.join(__dirname, '..', 'backend', '.env');
  const backendEnvExample = path.join(__dirname, '..', 'backend', '.env.example');
  if (!fs.existsSync(backendEnv) && fs.existsSync(backendEnvExample)) {
    fs.copyFileSync(backendEnvExample, backendEnv);
    log('Created backend/.env file', colors.green);
  }

  log('\n✅ Setup complete!', colors.green);
  log('\nNext steps:', colors.blue);
  log('1. Update .env files with your API keys and credentials');
  log('2. Create D1 database: npm run db:create');
  log('3. Run migrations: npm run db:migrate:local');
  log('4. Start development: npm run dev');
  log('\nFor more information, see README.md\n');
}

main().catch(error => {
  log(`\n❌ Setup failed: ${error.message}`, colors.red);
  process.exit(1);
});

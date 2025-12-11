# 环境设置指南

## 前置要求

在运行项目之前，需要安装以下工具：

### 1. Node.js (v20+)

**macOS (使用 Homebrew):**
```bash
# 安装 Homebrew (如果还没安装)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 安装 Node.js
brew install node@20
```

**或者使用 nvm (推荐):**
```bash
# 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 重启终端，然后安装 Node.js
nvm install 20
nvm use 20
```

### 2. pnpm (v8+)

```bash
# 使用 npm 安装 pnpm
npm install -g pnpm@8.15.0

# 或者使用 Homebrew
brew install pnpm
```

### 3. Python (v3.12+)

**macOS:**
```bash
# 使用 Homebrew
brew install python@3.12
```

### 4. uv (Python 包管理器)

```bash
# 安装 uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# 添加到 PATH (如果提示的话)
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

## 验证安装

运行以下命令验证所有工具都已正确安装：

```bash
node --version    # 应该显示 v20.x.x
pnpm --version    # 应该显示 8.x.x
python3 --version # 应该显示 3.12.x
uv --version      # 应该显示最新版本
```

## 安装项目依赖

一旦所有前置工具安装完成：

```bash
# 进入项目目录
cd /Users/xiaoyang/Proj/master-clash

# 安装所有依赖
make install

# 或者手动安装
pnpm install  # TypeScript 依赖
uv sync       # Python 依赖
```

## 启动开发环境

```bash
# 启动所有服务 (前端 + 后端)
make dev

# 或者分别启动
pnpm --filter @master-clash/web dev  # 只启动前端
cd apps/api && make dev               # 只启动后端
```

## 构建项目

```bash
# 构建所有包
make build

# 运行测试
make test

# Lint 代码
make lint
```

## 常见问题

### Q: pnpm install 失败

**A:** 尝试清理缓存并重新安装：
```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Q: uv sync 失败

**A:** 尝试清理虚拟环境：
```bash
rm -rf .venv uv.lock
uv sync
```

### Q: 找不到 @master-clash/* 包

**A:** 确保 pnpm workspace 正确配置并重新安装：
```bash
pnpm install --force
```

## 下一步

安装完成后，查看 [MIGRATION_COMPLETE.md](MIGRATION_COMPLETE.md) 了解：
- 项目结构说明
- 常用命令
- 开发工作流
- 故障排查

## 快速参考

| 命令 | 说明 |
|------|------|
| `make install` | 安装所有依赖 |
| `make dev` | 启动开发服务器 |
| `make build` | 构建所有包 |
| `make test` | 运行测试 |
| `make lint` | Lint 代码 |
| `make clean` | 清理构建产物 |

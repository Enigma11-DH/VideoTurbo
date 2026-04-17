# VideoTurbo 智能成片工具 - 完整部署指南

> **项目地址**: https://github.com/Enigma11-DH/VideoTurbo.git  
> **最后更新**: 2026-04-16  
> **适用系统**: Windows 10/11, macOS, Linux  
> **Node.js版本**: >= 18.0.0 (推荐 >= 20.0.0)

---

## 📋 目录

1. [项目概述](#项目概述)
2. [环境要求](#环境要求)
3. [快速开始（5分钟部署）](#快速开始5分钟部署)
4. [详细安装步骤](#详细安装步骤)
5. [配置说明](#配置说明)
6. [启动与验证](#启动与验证)
7. [功能使用指南](#功能使用指南)
8. [常见问题排查](#常见问题排查)
9. [API提供商配置](#api提供商配置)
10. [高级配置](#高级配置)

---

## 🎯 项目概述

VideoTurbo 是一个基于 AI 的智能视频生成工具，主要功能包括：

### ✨ 核心功能
- **🎬 批量素材上传**: 支持视频、图片多文件上传和拖拽
- **🔗 参考链接输入**: 支持 YouTube、Bilibili、抖音等平台链接
- **🎵 音频上传**: 支持BGM背景音乐上传用于节拍分析
- **🤖 多AI平台兼容**: 智谱AI、豆包、OpenAI、DeepSeek、通义千问
- **⚙️ 灵活配置**: 画面比例、目标时长、成片模板自定义
- **💾 素材暂存**: 自动保存用户操作，刷新页面不丢失
- **🔄 错误重试**: 自动重试机制，提升成功率

### 🏗️ 技术架构
```
前端 (React + TypeScript + Vite)
    ↓ HTTP API
后端 (Node.js + Express)
    ↓ 任务队列
Redis (任务队列管理)
    ↓ 视频处理
Python Worker (librosa + OpenCV + FFmpeg)
    ↓ AI调用
LLM API (智谱/豆包/OpenAI/...)
```

---

## 💻 环境要求

### 必需软件

| 软件 | 最低版本 | 推荐版本 | 用途 |
|------|---------|---------|------|
| **Node.js** | >= 18.0.0 | >= 20.0.0 | 运行时环境 |
| **npm** | >= 9.0.0 | >= 10.0.0 | 包管理器 |
| **Docker** | >= 20.0.0 | 最新版 | 运行Redis |
| **Git** | >= 2.30.0 | 最新版 | 版本控制 |

### 可选软件

| 软件 | 用途 | 是否必需 |
|------|------|---------|
| Python >= 3.9 | 后端视频处理 worker | 生产环境必需 |
| FFmpeg | 视频编解码 | 生产环境必需 |
| Chrome/Edge | 浏览器访问 | 必需 |

### 系统要求

- **内存**: >= 4GB RAM (推荐 8GB)
- **磁盘空间**: >= 2GB 可用空间
- **网络**: 需要访问外网（调用AI API）

---

## 🚀 快速开始（5分钟部署）

### 前置条件检查

打开终端（PowerShell/CMD/Terminal），运行：

```bash
# 检查 Node.js
node --version
# 应输出: v20.x.x 或更高

# 检查 npm
npm --version
# 应输出: 10.x.x 或更高

# 检查 Docker
docker --version
# 应输出: Docker version x.x.x

# 检查 Git
git --version
# 应输出: git version 2.x.x
```

### 一键部署脚本

**Windows PowerShell:**
```powershell
# 1. 克隆项目
git clone https://github.com/Enigma11-DH/VideoTurbo.git
cd VideoTurbo

# 2. 安装依赖
npm install

# 3. 启动 Redis
docker run -d --name videoturbo-redis -p 6379:6379 redis:7-alpine

# 4. 创建配置文件（如果不存在）
if (!(Test-Path .env)) { Copy-Item .env.example .env }

# 5. 启动开发服务器
npm run dev
```

**macOS/Linux:**
```bash
# 1. 克隆项目
git clone https://github.com/Enigma11-DH/VideoTurbo.git
cd VideoTurbo

# 2. 安装依赖
npm install

# 3. 启动 Redis
docker run -d --name videoturbo-redis -p 6379:6379 redis:7-alpine

# 4. 创建配置文件（如果不存在）
[ -f .env ] || cp .env.example .env

# 5. 启动开发服务器
npm run dev
```

### 访问应用

启动成功后，在浏览器中打开：

```
http://localhost:3000
```

您应该看到 "智能成片" 主页面！

---

## 📦 详细安装步骤

### 步骤1：获取项目代码

#### 方式A：克隆 GitHub 仓库（推荐）

```bash
git clone https://github.com/Enigma11-DH/VideoTurbo.git
cd VideoTurbo
```

#### 方式B：下载 ZIP 包

1. 访问 https://github.com/Enigma11-DH/VideoTurbo
2. 点击绿色的 "Code" 按钮
3. 选择 "Download ZIP"
4. 解压到您想要的目录
5. 打开终端，进入解压后的目录

### 步骤2：安装 Node.js 依赖

```bash
# 进入项目目录
cd VideoTurbo

# 清除旧的依赖（如果有）
rm -rf node_modules package-lock.json

# 安装所有依赖
npm install
```

**预计时间**: 2-5分钟（取决于网络速度）

**安装的依赖包括**:
- React 19 + TypeScript
- Vite 6 (构建工具)
- Express 4 (后端框架)
- ioredis 5 (Redis客户端)
- better-sqlite3 12 (SQLite数据库)
- multer 2 (文件上传)
- 以及其他UI和工具库...

### 步骤3：启动 Redis 服务

#### 方式A：使用 Docker（推荐）

```bash
# 创建并启动 Redis 容器
docker run -d \
  --name videoturbo-redis \
  -p 6379:6379 \
  redis:7-alpine

# 验证 Redis 是否运行
docker ps | findstr redis  # Windows
docker ps | grep redis     # macOS/Linux
```

**预期输出**:
```
videoturbo-redis   Up x seconds   0.0.0.0:6379->6379/tcp
```

#### 方式B：本地安装 Redis（高级用户）

**Windows:**
1. 下载 Redis for Windows: https://github.com/tporadowski/redis/releases
2. 解压并运行 `redis-server.exe`
3. 默认端口: 6379

**macOS:**
```bash
brew install redis
brew services start redis
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis
```

### 步骤4：配置环境变量

#### 创建 .env 文件

项目根目录已包含 `.env.example` 文件。复制它为 `.env`：

**Windows PowerShell:**
```powershell
Copy-Item .env.example .env
```

**macOS/Linux:**
```bash
cp .env.example .env
```

#### 编辑 .env 文件

使用文本编辑器打开 `.env` 文件，根据需要修改：

```env
# ===========================================
# VideoTurbo 环境配置
# ===========================================

# 应用访问地址（一般不需要修改）
APP_URL="http://localhost:3000"

# -------------------------------------------
# Redis 配置（必需）
# -------------------------------------------
REDIS_URL="redis://localhost:6379"

# -------------------------------------------
# 数据库配置（必需）
# -------------------------------------------
DB_PATH="./db/videoturbo.db"

# -------------------------------------------
# 输出目录（渲染的视频文件存放位置）
# -------------------------------------------
OUTPUT_DIR="./output"

# -------------------------------------------
# 可选 API 密钥（留空即可正常使用）
# -------------------------------------------
# Pexels API 密钥（用于获取免费素材视频）
PEXELS_API_KEY=""

# CapCut/剪映 API 密钥（用于导出剪映草稿）
CAPCUT_API_KEY=""
CAPCUT_API_BASE_URL="https://open.capcut.com"
```

**重要提示**:
- ✅ **大多数情况下，只需修改 `REDIS_URL`**
- ✅ **AI API 密钥在应用界面中配置，不在 .env 中**
- ❌ **不要将包含真实密钥的 .env 文件提交到 Git**

### 步骤5：创建必要目录

项目会自动创建以下目录，但如果遇到问题可以手动创建：

```bash
# 创建输出目录
mkdir -p output/uploads

# 创建数据库目录
mkdir -p db
```

### 步骤6：启动开发服务器

```bash
# 开发模式启动（支持热更新）
npm run dev
```

**成功启动的标志**:
```
[Server] Found /api/auto-edit endpoint at stack index 21
[VideoTurbo] API Gateway running on http://localhost:3000
[VideoTurbo] Redis: redis://localhost:6379
[VideoTurbo] SQLite: ./db/videoturbo.db

  ➜  Local:   http://localhost:3000/
  ➜  Network: use --host to expose
  ➜  press h to show help
```

### 步骤7：验证安装

在浏览器中访问 http://localhost:3000 ，您应该看到：

✅ **主页面标题**: "智能成片"  
✅ **三个核心按钮**: 
  - 📹 批量传素材
  - 🔗 输链接
  - 🎵 传音频  
✅ **配置选项**: 
  - 画面比例选择
  - 目标时长选择
  - 成片模板选择  
✅ **API配置区域**: 
  - "AI 模型配置" 可展开面板

---

## ⚙️ 配置说明

### 核心配置项

| 配置项 | 默认值 | 是否必需 | 说明 |
|--------|--------|---------|------|
| `APP_URL` | http://localhost:3000 | 否 | 应用访问URL |
| `REDIS_URL` | redis://localhost:6379 | **是** | Redis连接地址 |
| `DB_PATH` | ./db/videoturbo.db | **是** | SQLite数据库路径 |
| `OUTPUT_DIR` | ./output | 否 | 输出文件目录 |
| `PORT` | 3000 | 否 | 服务端口（可在代码中修改） |

### Redis 连接格式

```
redis://[:password@]host[:port][/db_number]

示例:
- redis://localhost:6379          # 本地无密码
- redis://:password@localhost:6379 # 有密码
- redis://192.168.1.100:6379      # 远程服务器
- redis://127.0.0.1:6379/1        # 使用数据库1
```

### 高级配置（可选）

#### 修改服务端口

编辑 `server.ts` 文件，找到这一行（约第850行）：

```typescript
const PORT = process.env.PORT || 3000;
```

改为您想要的端口号。

#### 使用外部 Redis

如果您有远程 Redis 服务器，修改 `.env`:

```env
REDIS_URL="redis://your-password@your-redis-host:6379"
```

---

## 🏃‍♂️ 启动与验证

### 开发模式（推荐日常使用）

```bash
npm run dev
```

**特点**:
- ✅ 支持热模块替换（HMR），修改代码自动刷新
- ✅ 详细错误日志
- ✅ Source Map 调试支持
- ❌ 不适合生产环境（性能较差）

### 生产模式构建

```bash
# 1. 构建前端资源
npm run build

# 2. 启动生产服务器
npm start
```

**特点**:
- ✅ 优化后的静态资源
- ✅ 更快的响应速度
- ✅ 适合生产部署
- ❌ 修改代码需要重新构建

### 验证清单

启动后，请逐项检查：

- [ ] 终端显示 `[VideoTurbo] API Gateway running on http://localhost:3000`
- [ ] 浏览器访问 http://localhost:3000 无报错
- [ ] 页面显示 "智能成片" 标题
- [ ] 可以点击三个核心按钮（批量传素材、输链接、传音频）
- [ ] 可以展开 "AI 模型配置" 面板
- [ ] 可以选择不同的API提供商
- [ ] 上传文件后不报错
- [ ] 刷新页面后素材信息保留（localStorage功能正常）

---

## 🎮 功能使用指南

### 基本流程

```
1️⃣ 打开 http://localhost:3000
      ↓
2️⃣ 上传素材（视频/图片）或 输入参考链接
      ↓
3️⃣ （可选）上传 BGM 音频文件
      ↓
4️⃣ 选择配置：
      • 画面比例：16:9 / 9:16 / 1:1 / 4:3
      • 目标时长：15s / 30s / 60s / 3min
      • 成片模板：Vlog / 产品展示 / 知识科普 / ...
      ↓
5️⃣ 配置 AI 模型：
      • 点击 "AI 模型配置" 展开
      • 选择 API 提供商（智谱/豆包/OpenAI/...）
      • 输入对应的 API 密钥
      • （可选）点击 "测试连接" 验证
      ↓
6️⃣ 点击 "一键成片" 提交任务
      ↓
7️⃣ 等待 AI 处理完成
      ↓
8️⃣ 下载生成的剪映草稿文件
```

### 详细操作说明

#### 1️⃣ 上传素材

**方式A：点击上传**
- 点击 "批量传素材" 按钮
- 在文件选择对话框中选择视频或图片文件
- 支持多选（按住 Ctrl/Cmd 选择多个）

**方式B：拖拽上传**
- 直接将文件拖拽到 "批量传素材" 区域
- 支持批量拖拽

**支持的格式**:
- 视频：MP4, MOV, AVI, MKV, WebM
- 图片：JPG, PNG, GIF, WebP, SVG

**文件大小限制**:
- 单个文件：建议 < 500MB
- 总大小：建议 < 2GB

#### 2️⃣ 输入参考链接

- 在 "输链接" 输入框中粘贴 URL
- 支持的平台：
  - YouTube (https://www.youtube.com/watch?v=xxx)
  - Bilibili (https://www.bilibili.com/video/BVxxx)
  - 抖音 (https://v.douyin.com/xxx)
- 此功能为可选，主要用于获取参考内容

#### 3️⃣ 上传音频

- 点击 "传音频" 按钮
- 选择 MP3, WAV, AAC, M4A, OGG 格式的音频文件
- 音频用于：
  - BGM 背景音乐
  - 节拍检测（自动卡点剪辑）

#### 4️⃣ 选择画面比例

| 比例 | 适用场景 | 示例 |
|------|---------|------|
| **16:9** | 横屏视频 | YouTube, B站横屏 |
| **9:16** | 竖屏视频 | 抖音, 快手, 小红书 |
| **1:1** | 方形视频 | 微博, Instagram |
| **4:3** | 传统比例 | 老式电视, PPT |

#### 5️⃣ 选择目标时长

| 时长 | 适用场景 | 说明 |
|------|---------|------|
| **15秒** | 短视频预告 | 抖音/快手短视频 |
| **30秒** | 标准短视频 | 最常用的长度 |
| **60秒** | 中长视频 | 内容较丰富的视频 |
| **3分钟** | 长视频 | Vlog, 教程类 |

#### 6️⃣ 选择成片模板

| 模板 | ID | 适用场景 |
|------|-----|---------|
| Vlog | vlog | 生活记录, 旅行Vlog |
| 产品展示 | product | 商品介绍, 广告 |
| 知识科普 | knowledge | 教程, 科普内容 |
| 旅行记录 | travel | 旅游风景, 探店 |
| 美食探店 | food | 美食制作, 探店 |
| 运动健身 | sports | 健身教学, 运动 |

#### 7️⃣ 配置 AI 模型（重要！）

这是最关键的步骤！

**步骤**:
1. 点击 "AI 模型配置" 卡片展开
2. 从网格中选择您的 API 提供商
3. 在 "API 密钥" 输入框中粘贴您的密钥
4. （强烈推荐）点击 "测试连接" 按钮
5. 看到 "✅ 连接成功" 后，关闭配置面板

**支持的API提供商**:

| 提供商 | 免费额度 | 推荐场景 | 获取密钥 |
|--------|---------|---------|---------|
| 🧠 **智谱AI** | 充足 | 中文任务首选 | https://open.bigmodel.cn |
| 🫘 **豆包** | 性价比高 | 通用任务 | https://console.volcengine.com/ark |
| 🤖 **OpenAI** | 付费 | 英文任务 | https://platform.openai.com |
| 🔍 **DeepSeek** | 价格低 | 代码/技术 | https://platform.deepseek.com |
| 💬 **通义千问** | 免费 | 中文优化 | https://dashscope.console.aliyun.com |
| ⚙️ **自定义** | - | 自托管模型 | 填写Base URL和Model名称 |

**如何获取API密钥**（以智谱AI为例）:

1. 访问 https://open.bigmodel.cn
2. 注册/登录账号
3. 进入 "API Keys" 页面
4. 点击 "创建 API Key"
5. 复制生成的密钥（以 `.` 开头的字符串）
6. 粘贴到应用的 "API 密钥" 输入框

**测试连接**:
- 点击 "🧪 测试连接" 按钮
- 等待 5-15 秒
- 成功：显示 "✅ 连接成功！模型: xxx"
- 失败：显示错误原因（如 "API Key 无效"）

#### 8️⃣ 提交任务

- 确认所有配置正确
- 点击底部的 "✨ 一键成片" 大按钮
- 按钮变为 "正在提交..." 并显示加载动画
- 成功后自动跳转到任务列表页
- 显示 toast 通知："任务已提交，正在智能剪辑..."

#### 9️⃣ 查看任务状态

- 任务提交后进入队列
- 页面会显示进度条
- 可以查看实时状态：
  - `queued` - 排队中
  - `processing` - 处理中
  - `completed` - 完成
  - `failed` - 失败

#### 🔟 下载结果

- 任务完成后，会生成剪映草稿文件（.draft 格式）
- 可以在剪映/CapCut中打开并进一步编辑
- 导出最终视频

---

## 🔧 API 提供商配置详解

### 智谱AI (Zhipu) - 推荐新手使用

**特点**:
- ✅ 新用户有大量免费额度
- ✅ 中文理解能力强
- ✅ 响应速度快
- ✅ 国内访问稳定

**配置参数**:
- Base URL: `https://open.bigmodel.cn/api/paas/v4`
- 默认模型: `glm-4-flash` (免费)
- 其他模型: `glm-4`, `glm-4-plus` (付费)

**获取密钥**:
1. 访问 https://open.bigmodel.cn
2. 注册账号（手机号注册）
3. 实名认证（需要身份证）
4. 进入控制台 → API Keys
5. 创建新Key

**费用**:
- glm-4-flash: 免费（有限额）
- glm-4: 约 ¥0.001/千tokens
- glm-4-plus: 约 ¥0.005/千tokens

### 豆包 (Doubao/ByteDance)

**特点**:
- ✅ 字节跳动出品，性价比高
- ✅ 中文能力优秀
- ✅ 适合长文本处理

**配置参数**:
- Base URL: `https://ark.cn-beijing.volces.com/api/v3`
- 默认模型: `doubao-pro-32k`
- 其他模型: `doubao-lite`, `doubao-pro`

**获取密钥**:
1. 访问 https://console.volcengine.com/ark
2. 注册火山引擎账号
3. 创建应用并获取 API Key

### OpenAI GPT

**特点**:
- ✅ 业界标杆，效果最稳定
- ✅ 英文能力强
- ✅ 生态完善
- ❌ 需要科学上网
- ❌ 费用较高

**配置参数**:
- Base URL: `https://api.openai.com/v1`
- 默认模型: `gpt-4o-mini` (便宜)
- 其他模型: `gpt-4o`, `gpt-4-turbo`

**获取密钥**:
1. 访问 https://platform.openai.com
2. 注册/登录 OpenAI 账号
3. 进入 API Keys 页面
4. 创建新的 Secret Key

**费用**:
- gpt-4o-mini: $0.15/百万input tokens
- gpt-4o: $2.5/百万input tokens

### DeepSeek

**特点**:
- ✅ 开源模型，价格极低
- ✅ 代码能力强
- ✅ 数学推理优秀
- ✅ 支持超长上下文

**配置参数**:
- Base URL: `https://api.deepseek.com/v1`
- 默认模型: `deepseek-chat`
- 其他模型: `deepseek-reasoner`

**获取密钥**:
1. 访问 https://platform.deepseek.com
2. 注册账号
3. 进入 API Keys 页面
4. 创建新Key

**费用**:
- deepseek-chat: ¥1/百万tokens (极其便宜!)
- deepseek-reasoner: ¥4/百万tokens

### 通义千问 (Qwen/Alibaba)

**特点**:
- ✅ 阿里云出品，中文优化好
- ✅ 有免费额度
- ✅ 国内访问快

**配置参数**:
- Base URL: `https://dashscope.aliyuncs.com/compatible-mode/v1`
- 默认模型: `qwen-turbo`
- 其他模型: `qwen-plus`, `qwen-max`

**获取密钥**:
1. 访问 https://dashscope.console.aliyun.com
2. 登录阿里云账号
3. 创建 API Key

### 自定义 API (Custom)

**适用场景**:
- 使用自托管的 LLM 服务
- 使用其他兼容 OpenAI 的 API
- 公司内部部署的模型

**配置方法**:
1. 选择 "自定义 API" 提供商
2. 填写 **Base URL**:
   ```
   例如: https://your-api-server.com/v1
   ```
3. 填写 **模型名称**:
   ```
   例如: llama-3-70b, qwen2-72b
   ```
4. 输入对应的 API 密钥

**要求**:
- API 必须兼容 OpenAI 格式
- 端点路径: `/chat/completions`
- 请求格式: `{ model, messages, ... }`
- 响应格式: `{ choices: [{ message: { content } }] }`

---

## 🐛 常见问题排查

### 问题1：ERR_CONNECTION_REFUSED

**症状**: 浏览器显示 "无法访问此网站" 或 "连接被拒绝"

**原因**: 开发服务器未启动

**解决方案**:
```bash
# 1. 确认在正确的目录
cd d:\Users\Enigma\Desktop\viodeoturbo

# 2. 检查 Node.js 是否安装
node --version

# 3. 检查依赖是否安装
Test-Path node_modules  # Windows
ls node_modules         # macOS/Linux

# 如果没有，运行:
npm install

# 4. 启动服务器
npm run dev
```

### 问题2：Redis 连接失败

**症状**: 终端显示 `Error: connect ECONNREFUSED 127.0.0.1:6379`

**原因**: Redis 服务未运行

**解决方案**:
```bash
# 检查 Docker 是否运行
docker --version

# 检查 Redis 容器状态
docker ps -a | grep redis

# 如果容器存在但停止了
docker start videoturbo-redis

# 如果容器不存在，创建新容器
docker run -d --name videoturbo-redis -p 6379:6379 redis:7-alpine

# 验证 Redis 正在运行
docker ps | grep redis
# 应该看到 "Up" 状态
```

### 问题3：端口 3000 已被占用

**症状**: 终端显示 `Error: listen EADDRINUSE :::3000`

**原因**: 另一个程序正在使用 3000 端口

**解决方案**:
```bash
# 方法1：查找并结束占用进程（Windows）
netstat -ano | findstr :3000
taskkill /PID <进程ID> /F

# 方法2：查找并结束占用进程（macOS/Linux）
lsof -i :3000
kill -9 <PID>

# 方法3：修改项目使用的端口（编辑 server.ts）
# 找到这行并修改：
const PORT = process.env.PORT || 3001;  # 改为 3001
```

### 问题4：npm install 失败

**症状**: 显示各种依赖安装错误

**解决方案**:
```bash
# 1. 清除缓存
npm cache clean --force

# 2. 删除旧的依赖
rm -rf node_modules package-lock.json

# 3. 重新安装
npm install

# 4. 如果仍然失败，尝试使用淘宝镜像
npm config set registry https://registry.npmmirror.com
npm install
```

### 问题5：API 连接测试失败

**症状**: 点击 "测试连接" 后显示错误

**常见错误及解决**:

| 错误信息 | 原因 | 解决方案 |
|---------|------|---------|
| `401 Unauthorized` | API Key 无效 | 检查密钥是否正确复制 |
| `403 Forbidden` | 权限不足 | 检查账户是否有权限 |
| `404 Not Found` | URL或模型名错误 | 检查Base URL和Model是否正确 |
| `429 Too Many Requests` | 请求频率过高 | 等待几分钟后重试 |
| `Connection timeout` | 网络问题 | 检查网络连接；如果是OpenAI需要VPN |
| `DNS resolution failed` | DNS解析失败 | 检查网络；确认URL拼写正确 |

**调试技巧**:
1. 打开浏览器开发者工具（F12）
2. 切换到 "Console" 标签
3. 查看 `[TestLLM]` 开头的日志
4. 切换到 "Network" 标签
5. 找到 `test-llm` 请求，查看响应详情

### 问题6：JSON 解析错误

**症状**: 提交任务时显示 "Failed to execute 'json' on 'Response'..."

**原因**: 后端返回了无效的 JSON 响应

**解决方案**:
此问题已在最新版本修复。如果仍然出现：

1. **查看终端日志**:
   ```bash
   # 在运行 npm run dev 的终端窗口查看
   # 寻找 [Auto-Edit] 开头的日志
   ```

2. **查看浏览器控制台**:
   - 按 F12 打开开发者工具
   - 切换到 Console 标签
   - 寻找 `[Submit]` 开头的日志
   - 查看原始响应内容

3. **常见原因**:
   - Python worker 未安装或崩溃
   - LLM API 调用失败
   - FFmpeg 未安装

4. **完整错误报告**:
   如果问题持续，请在 GitHub 提交 Issue，包含：
   - 终端完整日志（500行）
   - 浏览器控制台截图
   - 使用的操作系统和版本
   - Node.js 和 npm 版本

### 问题7：上传文件失败

**症状**: 选择文件后无反应或报错

**解决方案**:
1. **检查文件大小**: 单个文件建议 < 500MB
2. **检查文件格式**: 确保是支持的视频/图片格式
3. **检查浏览器权限**: 确允许访问本地文件
4. **清除浏览器缓存**: Ctrl+Shift+Delete (Windows)

### 问题8：页面刷新后素材丢失

**症状**: 刷新页面后之前上传的文件不见了

**说明**: 这是**正常行为**！出于安全考虑，浏览器不允许网页持久化保存 File 对象。

**但是**，我们的实现会：
- ✅ 保存文件的元信息（名称、大小、类型）
- ✅ 保存用户配置（比例、时长、模板、API设置）
- ✅ 刷新后显示 "发现上次暂存的素材" 提示
- ✅ 提示您重新上传文件

**如果连元信息都丢失**:
1. 检查浏览器 localStorage 是否启用
2. 检查是否有隐私插件阻止存储
3. 尝试使用无痕/隐私模式

---

## 🚀 高级配置

### 使用 Docker Compose 一键部署

适用于生产环境或不想手动安装依赖的用户。

创建 `docker-compose.yml`:

```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    container_name: videoturbo-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

  app:
    build:
      context: .
      dockerfile: Dockerfile.node
    container_name: videoturbo-app
    ports:
      - "3000:3000"
    environment:
      - REDIS_URL=redis://redis:6379
      - DB_PATH=/app/db/videoturbo.db
      - OUTPUT_DIR=/app/output
    volumes:
      - ./output:/app/output
      - ./db:/app/db
    depends_on:
      - redis
    restart: unless-stopped

volumes:
  redis_data:
```

**启动**:
```bash
docker-compose up -d
```

**停止**:
```bash
docker-compose down
```

### 配置反向代理（Nginx）

适用于将应用部署到公网。

**nginx.conf**:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
        
        # 文件上传大小限制
        client_max_body_size 500M;
    }
}
```

**重启 Nginx**:
```bash
sudo nginx -t           # 测试配置
sudo systemctl reload nginx
```

### 启用 HTTPS（Let's Encrypt）

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx  # Ubuntu/Debian

# 获取证书
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

### 性能优化建议

#### 1. 增加 Node.js 内存限制

```bash
# 在启动命令前添加
set NODE_OPTIONS=--max-old-space-size=4096  # Windows
export NODE_OPTIONS=--max-old-space-size=4096  # macOS/Linux

npm run dev
```

#### 2. 使用 PM2 进程管理器（生产环境）

```bash
# 安装 PM2
npm install -g pm2

# 启动应用
pm2 start npm --name "videoturbo" -- run start

# 查看状态
pm2 status

# 查看日志
pm2 logs videoturbo

# 设置开机自启
pm2 startup
pm2 save
```

#### 3. 优化 Redis 配置

编辑 Redis 配置文件（如需要）：

```bash
# 进入 Redis 容器
docker exec -it videoturbo-redis sh

# 编辑配置（可选）
# vi /usr/local/etc/redis/redis.conf
```

常用优化参数：
```
maxmemory 256mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

---

## 📊 项目结构说明

```
VideoTurbo/
├── components/              # React 组件
│   ├── ui/                 # UI 基础组件（Button, Card, Input...）
│   ├── NewProject.tsx      # 主页面（智能成片）
│   ├── TaskList.tsx        # 任务列表
│   └── Settings.tsx        # 设置页面
├── lib/                    # 工具库
│   ├── api-client.ts       # API 客户端（统一封装）
│   ├── material-storage.ts # 素材持久化（localStorage）
│   ├── store.ts            # 全局状态管理（Zustand）
│   └── utils.ts            # 工具函数
├── python/                 # Python 后端
│   ├── tasks/              # 任务处理器
│   │   ├── video_render.py # 视频渲染
│   │   ├── ai_analysis.py  # AI 分析
│   │   └── pipeline.py     # 处理流水线
│   ├── utils/              # 工具函数
│   │   ├── llm_adapter.py  # LLM 适配器
│   │   ├── json_utils.py   # JSON 解析工具
│   │   └── ffmpeg_helper.py # FFmpeg 封装
│   └── requirements.txt    # Python 依赖
├── db/                     # 数据库
│   └── schema.sql          # 数据库表结构
├── docs/                   # 文档
│   └── JSON_DEBUG_GUIDE.md # JSON 调试指南
├── server.ts               # 主服务器（Express + Vite）
├── package.json            # Node.js 依赖
├── tsconfig.json           # TypeScript 配置
├── vite.config.ts          # Vite 构建配置
├── .env                    # 环境变量（需自行创建）
├── .env.example            # 环境变量示例
└── README.md               # 项目说明
```

---

## 🛠️ 开发者指南

### 本地开发流程

1. **修改前端代码**:
   - 编辑 `components/` 或 `lib/` 下的文件
   - 保存后浏览器自动热更新（HMR）
   - 无需手动刷新

2. **修改后端代码**:
   - 编辑 `server.ts`
   - 保存后自动重启服务器
   - 或者手动重启：`Ctrl+C` 然后 `npm run dev`

3. **调试 API**:
   - 使用浏览器开发者工具 Network 标签
   - 或使用 Postman / Insomnia
   - 查看 `/api/test-llm` 和 `/api/auto-edit` 端点

4. **查看日志**:
   - 终端输出包含详细的请求日志
   - 日志前缀：
     - `[Server]` - 服务器启动
     - `[Auto-Edit]` - 任务提交
     - `[Test-LLM]` - API 测试
     - `[Storage]` - 素材存储
     - `[API]` - API 调用

### 代码规范

- **TypeScript**: 严格模式，所有类型必须定义
- **React**: 函数组件 + Hooks
- **样式**: Tailwind CSS 类名
- **命名**: camelCase (变量), PascalCase (组件), UPPER_SNAKE_CASE (常量)
- **注释**: 重要逻辑必须注释（中文）

### 提交代码

```bash
# 检查更改
git status

# 添加文件
git add .

# 提交（遵循约定式提交）
git commit -m "feat: 添加新功能"
# 或
git commit -m "fix: 修复bug"

# 推送到远程
git push origin main
```

**提交类型**:
- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式调整
- `refactor`: 重构
- `test`: 测试相关
- `chore`: 构建/工具链

---

## 📞 获取帮助

### 文档资源

- **项目 README**: https://github.com/Enigma11-DH/VideoTurbo#readme
- **JSON 调试指南**: [docs/JSON_DEBUG_GUIDE.md](./docs/JSON_DEBUG_GUIDE.md)
- **API 文档**: （待补充）

### 问题反馈

如果在部署或使用过程中遇到问题：

1. **首先查看本文档的 "常见问题排查" 章节**
2. **搜索 GitHub Issues**: https://github.com/Enigma11-DH/VideoTurbo/issues
3. **提交新 Issue**:
   - 标题：简洁描述问题
   - 内容：
     - 操作系统及版本
     - Node.js 和 npm 版本
     - 完整的错误日志
     - 复现步骤
     - 期望行为 vs 实际行为
     - 截图（如有）

### 社区支持

- **GitHub Discussions**: （待开通）
- **QQ群/微信群**: （待建立）

---

## 📝 更新日志

### v2.0.0 (2026-04-16)

#### ✨ 新功能
- **多API兼容**: 支持智谱AI、豆包、OpenAI、DeepSeek、通义千问、自定义API
- **素材暂存**: localStorage 自动保存，刷新页面不丢失配置
- **增强错误处理**: 自动重试机制（最多3次）、详细错误日志
- **API测试功能**: 一键测试API连接是否正常
- **统一API客户端**: 封装 fetch，支持超时、重试、错误分类

#### 🐛 Bug 修复
- **修复 JSON 解析错误**: 解决 "Unexpected end of JSON input" 问题
- **修复素材丢失**: 页面刷新后保留配置和元信息
- **改善用户体验**: 中文友好错误提示，更长的 Toast 显示时间

#### 🔧 技术改进
- 新增 `lib/api-client.ts` - 统一 API 调用层
- 新增 `lib/material-storage.ts` - 素材持久化工具
- 增强 `server.ts` - 新增 `/api/test-llm` 端点
- 更新 `python/utils/llm_adapter.py` - 添加豆包支持

#### 📁 文件变更
- 新增文件: 2 个
- 修改文件: 5 个
- 总代码行数: +850 行

---

## 📄 许可证

本项目采用 MIT 许可证。详见 [LICENSE](./LICENSE) 文件。

---

## 🙏 致谢

感谢以下开源项目和社区：
- React 团队
- Vite 团队
- Express 团队
- Redis 团队
- 所有贡献者和使用者

---

**祝您使用愉快！** 🎉

如有任何问题，欢迎通过 GitHub Issues 反馈。

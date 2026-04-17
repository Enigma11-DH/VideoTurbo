# VideoTurbo - 智能视频生成工具

> **基于 AI 的智能视频成片工具，支持多平台 API 兼容**

## 📋 项目简介

VideoTurbo 是一个基于 AI 的智能视频生成工具，能够将用户上传的素材自动分析并生成剪映草稿文件。

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

## 🚀 快速开始

### 环境要求

| 软件 | 最低版本 | 推荐版本 | 用途 |
|------|---------|---------|------|
| **Node.js** | >= 18.0.0 | >= 20.0.0 | 运行时环境 |
| **npm** | >= 9.0.0 | >= 10.0.0 | 包管理器 |
| **Docker** | >= 20.0.0 | 最新版 | 运行Redis |
| **Git** | >= 2.30.0 | 最新版 | 版本控制 |

### 安装步骤

1. **克隆项目**
   ```bash
   git clone https://github.com/Enigma11-DH/VideoTurbo.git
   cd VideoTurbo
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **启动 Redis**
   ```bash
   docker run -d --name videoturbo-redis -p 6379:6379 redis:7-alpine
   ```

4. **配置环境变量**
   ```bash
   # 复制配置文件
   cp .env.example .env
   
   # 编辑 .env 文件（一般不需要修改）
   # 详细配置见 DEPLOYMENT_GUIDE.md
   ```

5. **启动开发服务器**
   ```bash
   npm run dev
   ```

6. **访问应用**
   打开浏览器访问：**http://localhost:3000**

## 🎮 使用指南

### 基本流程

1. **打开应用**：访问 http://localhost:3000
2. **上传素材**：点击 "批量传素材" 或拖拽文件
3. **输入参考链接**：（可选）粘贴视频链接
4. **上传音频**：（可选）上传BGM音频文件
5. **选择配置**：
   - 画面比例：16:9 / 9:16 / 1:1 / 4:3
   - 目标时长：15s / 30s / 60s / 3min
   - 成片模板：Vlog / 产品展示 / 知识科普 / ...
6. **配置 AI 模型**：
   - 点击 "AI 模型配置" 展开
   - 选择 API 提供商（智谱/豆包/OpenAI/...）
   - 输入对应的 API 密钥
   - 点击 "测试连接" 验证
7. **点击 "一键成片"**：提交任务
8. **等待处理**：AI 分析并生成剪映草稿
9. **下载结果**：获取剪映草稿文件

### 支持的 API 提供商

| 提供商 | 免费额度 | 推荐场景 | 获取密钥 |
|--------|---------|---------|---------|
| 🧠 **智谱AI** | 充足 | 中文任务首选 | https://open.bigmodel.cn |
| 🫘 **豆包** | 性价比高 | 通用任务 | https://console.volcengine.com/ark |
| 🤖 **OpenAI** | 付费 | 英文任务 | https://platform.openai.com |
| 🔍 **DeepSeek** | 价格低 | 代码/技术 | https://platform.deepseek.com |
| 💬 **通义千问** | 免费 | 中文优化 | https://dashscope.console.aliyun.com |
| ⚙️ **自定义** | - | 自托管模型 | 填写Base URL和Model名称 |

## 📁 项目结构

```
VideoTurbo/
├── components/              # React 组件
│   ├── ui/                 # UI 基础组件
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
│   ├── utils/              # 工具函数
│   └── requirements.txt    # Python 依赖
├── db/                     # 数据库
│   └── schema.sql          # 数据库表结构
├── docs/                   # 文档
│   └── JSON_DEBUG_GUIDE.md # JSON 调试指南
├── server.ts               # 主服务器（Express + Vite）
├── package.json            # Node.js 依赖
├── tsconfig.json           # TypeScript 配置
├── vite.config.ts          # Vite 构建配置
├── .env                    # 环境变量
├── .env.example            # 环境变量示例
├── DEPLOYMENT_GUIDE.md     # 部署指南
└── README.md               # 项目说明
```

## 🔧 配置说明

### 核心配置项

| 配置项 | 默认值 | 是否必需 | 说明 |
|--------|--------|---------|------|
| `APP_URL` | http://localhost:3000 | 否 | 应用访问URL |
| `REDIS_URL` | redis://localhost:6379 | **是** | Redis连接地址 |
| `DB_PATH` | ./db/videoturbo.db | **是** | SQLite数据库路径 |
| `OUTPUT_DIR` | ./output | 否 | 输出文件目录 |
| `PORT` | 3000 | 否 | 服务端口 |

### 环境变量

**`.env` 文件示例**：
```env
# 应用访问地址
APP_URL="http://localhost:3000"

# Redis 连接配置（必需）
REDIS_URL="redis://localhost:6379"

# SQLite 数据库路径（必需）
DB_PATH="./db/videoturbo.db"

# 输出目录（渲染的视频文件存放位置）
OUTPUT_DIR="./output"

# Pexels API 密钥（用于获取素材视频，可选）
PEXELS_API_KEY=""

# CapCut/剪映 API 密钥（用于导出草稿，可选）
CAPCUT_API_KEY=""
CAPCUT_API_BASE_URL="https://open.capcut.com"
```

## 🐛 常见问题

### 1. 连接被拒绝 (ERR_CONNECTION_REFUSED)

**原因**：开发服务器未启动

**解决方案**：
```bash
# 启动 Redis
docker start videoturbo-redis

# 启动开发服务器
npm run dev
```

### 2. Redis 连接失败

**原因**：Redis 服务未运行

**解决方案**：
```bash
# 启动 Redis 容器
docker start videoturbo-redis

# 验证 Redis 运行状态
docker ps | grep redis
```

### 3. API 连接测试失败

**常见错误**：
- `401 Unauthorized`：API Key 无效
- `403 Forbidden`：权限不足
- `404 Not Found`：URL或模型名错误
- `429 Too Many Requests`：请求频率过高
- `Connection timeout`：网络问题

**解决方案**：
- 检查 API Key 是否正确复制
- 确保网络连接正常（OpenAI 需要科学上网）
- 查看浏览器控制台的详细错误信息

### 4. 上传文件失败

**原因**：
- 文件过大（建议 < 500MB）
- 浏览器权限问题
- 网络中断

**解决方案**：
- 尝试上传较小的文件
- 清除浏览器缓存
- 检查网络连接

## 📚 文档资源

- **完整部署指南**: [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
- **JSON 调试指南**: [docs/JSON_DEBUG_GUIDE.md](./docs/JSON_DEBUG_GUIDE.md)
- **API 文档**: （待补充）

## 🔄 开发模式

### 启动开发服务器

```bash
npm run dev
```

**特点**：
- ✅ 支持热模块替换（HMR）
- ✅ 详细错误日志
- ✅ Source Map 调试支持

### 构建生产版本

```bash
# 构建前端资源
npm run build

# 启动生产服务器
npm start
```

## 🚀 生产部署

### 使用 Docker Compose

**`docker-compose.yml` 示例**：
```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    container_name: videoturbo-redis
    ports:
      - "6379:6379"
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
```

**启动**：
```bash
docker-compose up -d
```

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

## 📄 许可证

本项目采用 MIT 许可证。详见 [LICENSE](./LICENSE) 文件。

## 🙏 致谢

感谢以下开源项目和社区：
- React 团队
- Vite 团队
- Express 团队
- Redis 团队
- 所有贡献者和使用者

## 📞 联系我们

- **项目地址**: https://github.com/Enigma11-DH/VideoTurbo
- **Issue 提交**: https://github.com/Enigma11-DH/VideoTurbo/issues

---

**祝您使用愉快！** 🎉
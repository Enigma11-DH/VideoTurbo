# 🔧 JSON响应解析失败 - 调试指南

当系统提示"响应JSON失败"或视频生成失败时，请按照以下步骤排查问题。

---

## 🚨 **快速诊断流程图**

```
遇到"JSON解析失败"错误？
        │
        ▼
   ┌─────────────┐
   │ 1. 查看日志  │ ← 最重要！
   └──────┬──────┘
          │
    ┌─────┴─────┐
    ▼           ▼
 成功？      失败？
    │           │
    ▼           ▼
 正常生成   继续排查 ↓
```

---

## 📝 **第一步：查看详细日志**

### **方法A：查看控制台输出（推荐）**

运行Python worker时，日志会直接输出到终端：

```bash
cd d:\Users\Enigma\Desktop\viodeoturbo\python
python worker.py
```

查找以下关键日志标记：
- `[LLM]` - LLM API调用相关
- `[Pipeline]` - 流水线执行相关
- `[AI Analysis]` - AI分析任务相关
- `[JSON Parser]` - JSON解析器诊断

### **方法B：查看保存的原始响应文件**

如果JSON解析失败，系统会自动保存LLM的原始响应用于调试：

```bash
# 文件位置
d:\Users\Enigma\Desktop\viodeoturbo\output\debug\
```

查找以 `_llm_response.txt` 或 `_analysis_response.txt` 结尾的文件。

**示例文件内容：**
```
Task ID: abc123def456
Timestamp: 2026-04-16 10:30:00
Prompt length: 1234
Response length: 5678
================================================================================

RAW LLM RESPONSE:
这是智谱AI返回的原始文本...
可能包含markdown代码块、解释文字等...
```

---

## 🔍 **第二步：常见问题及解决方案**

### **❌ 问题1：LLM返回了非JSON格式**

**症状：**
```
[JSON Parser] All parsing strategies failed
[JSON Parser] Method: direct_parse -> Status: json_error
```

**原因：**
- 智谱AI返回了解释性文字而不是纯JSON
- 返回了HTML或其他格式
- 响应被截断

**解决方案：**

✅ **检查API Key是否正确**
```python
# 在设置中确认：
# Base URL: https://open.bigmodel.cn/api/paas/v4
# Model: glm-4-flash 或 glm-4-plus
# API Key: 以 "xxxxx" 开头的完整密钥
```

✅ **手动测试API连接**
```bash
curl https://open.bigmodel.cn/api/paas/v4/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"glm-4-flash","messages":[{"role":"user","content":"Hi"}]}'
```

✅ **查看原始响应内容**
打开 `output/debug/xxx_llm_response.txt` 文件，查看智谱AI实际返回了什么。

---

### **❌ 问题2：Markdown代码块未正确处理**

**症状：**
```
Raw Response: ```json\n[{"scene": 1}]\n```
Method used: markdown_strip (success)
```

**说明：** 这个其实是成功的！只是使用了备用策略。

**但如果仍然失败：**

✅ 系统已自动处理以下情况：
- ` ```json ... ``` `
- ` ``` ... ``` `
- JSON前后有其他文字

✅ 如果仍有问题，请提供原始响应文件内容给我分析。

---

### **❌ 问题3：网络超时或连接失败**

**症状：**
```
[LLM] URL/Network Error: [Errno 11001] getaddrinfo failed
Cannot connect to LLM server at https://open.bigmodel.cn/api/paas/v4
```

**解决方案：**

✅ **检查网络连接**
```bash
ping open.bigmodel.cn
```

✅ **检查代理设置**（如果在中国大陆）
```bash
# 可能需要配置代理
set HTTP_PROXY=http://127.0.0.1:7890
set HTTPS_PROXY=http://127.0.0.1:7890
```

✅ **检查防火墙/杀毒软件**
确保没有阻止Python访问外网。

---

### **❌ 问题4：API认证失败**

**症状：**
```
[LLM] HTTP Error: 401 Unauthorized
Error body: {"error":{"code":"invalid_api_key","message":"Invalid API key"}}
```

**解决方案：**

✅ **验证API Key有效性**
1. 登录 https://open.bigmodel.cn/
2. 进入"API Keys"管理页面
3. 确认Key状态为"已启用"
4. 复制完整的Key（不要有多余空格）

✅ **检查余额/配额**
- 免费模型 `glm-4-flash` 有调用次数限制
- 检查账户余额是否充足

---

### **❌ 问题5：模型不存在或名称错误**

**症状：**
```
[LLM] HTTP Error: 404 Not Found
Error body: {"error":{"code":"invalid_model","message":"Model not found"}}
```

**解决方案：**

✅ **使用正确的模型名称**
| 模型 | 用途 | 价格 |
|------|------|------|
| `glm-4-flash` | 日常使用（推荐） | 免费 |
| `glm-4-plus` | 复杂任务 | 付费 |
| `glm-4-air` | 轻量任务 | 免费 |
| `glm-4v` | 多模态（图片+文字） | 付费 |

✅ **在Settings中修改Model字段**
设置为上述正确的模型名。

---

### **❌ 问题6：响应被截断（Incomplete JSON）**

**症状：**
```
[JSON Parser] Method: repair_extract_from_text -> Status: json_error
Error: Expecting ',' delimiter: line 15 column 42 (char 892)
```

**原因：**
- LLM输出太长，达到max_tokens限制
- 网络中断导致数据不完整

**解决方案：**

✅ **增加max_tokens限制**（需要修改代码）
在 [llm_adapter.py](file:///d:\Users\Enigma\Desktop\viodeoturbo\python\utils\llm_adapter.py) 的 `chat()` 方法中：
```python
# 默认值是4096，可以增加到8192
max_tokens: int = 8192,
```

✅ **简化Prompt要求**
在创建任务时：
- 减少场景数量（建议3-5个）
- 缩短视频时长（15-30秒）
- 使用更简洁的主题描述

---

## 🛠️ **第三步：高级调试技巧**

### **1. 启用详细日志模式**

编辑 [worker.py](file:///d:\Users\Enigma\Desktop\viodeoturbo\python\worker.py)，在开头添加：

```python
import logging

logging.basicConfig(
    level=logging.DEBUG,  # 改为DEBUG级别
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('debug.log', encoding='utf-8')
    ]
)
```

### **2. 手动测试JSON解析器**

运行内置测试：

```bash
cd python/utils
python json_utils.py
```

这会测试各种格式的JSON解析能力。

### **3. 使用在线JSON验证工具**

如果拿到了原始响应，可以复制到以下网站验证：
- https://jsonlint.com/
- https://jsonformatter.org/

---

## 📊 **第四步：收集信息提交反馈**

如果以上步骤都无法解决问题，请提供以下信息：

### **必需信息：**

1. **错误日志截图或文本**
   - 包含 `[LLM]`、`[Pipeline]`、`[JSON Parser]` 标记的部分

2. **原始响应文件**
   - `output/debug/xxx_llm_response.txt` 的完整内容

3. **你的配置信息**（隐藏敏感信息）
   ```
   Base URL: https://open.bigmodel.cn/api/paas/v4
   Model: glm-4-xxx
   API Key: sk-xxxx...xxxx (显示前8位和后4位即可)
   ```

4. **复现步骤**
   - 你输入了什么主题？
   - 上传了什么素材？
   - 使用的什么模板？

### **可选信息：**

5. **环境信息**
   - 操作系统版本
   - Python版本 (`python --version`)
   - Node.js版本 (`node --version`)
   - 是否使用代理/VPN

6. **网络测试结果**
   ```bash
   curl -I https://open.bigmodel.cn/api/paas/v4
   ```

---

## ✅ **成功案例参考**

### **正常的日志输出应该类似这样：**

```
2026-04-16 10:30:00 - __main__ - INFO - Starting task processing...
2026-04-16 10:30:01 - utils.llm_adapter - INFO - [LLM] Initialized adapter
2026-04-16 10:30:01 - utils.llm_adapter - DEBUG - [LLM] Base URL: https://open.bigmodel.cn/api/paas/v4
2026-04-16 10:30:01 - utils.llm_adapter - DEBUG - [LLM] Model: glm-4-flash
2026-04-16 10:30:02 - utils.llm_adapter - INFO - [LLM] Sending request to glm-4-flash
2026-04-16 10:30:05 - utils.llm_adapter - INFO - [LLM] Response received - Status: 200, Size: 1234 bytes
2026-04-16 10:30:05 - utils.llm_adapter - DEBUG - [LLM] Response parsed successfully
2026-04-16 10:30:05 - utils.llm_adapter - INFO - [LLM] Successfully extracted content (987 chars)
2026-04-16 10:30:06 - tasks.pipeline - INFO - [Pipeline] LLM response received (length: 987)
2026-04-16 10:30:06 - tasks.pipeline - DEBUG - [Pipeline] LLM raw response preview: [{"source":...
2026-04-16 10:30:06 - utils.json_utils - INFO - [pipeline:abc123] Successfully parsed JSON array with 5 items
2026-04-16 10:30:06 - utils.json_utils - DEBUG - [pipeline:abc123] Method used: markdown_strip
```

---

## 📞 **获取帮助**

如果按照以上步骤仍无法解决：

1. **查看GitHub Issues**
   - 访问：https://github.com/Enigma11-DH/VideoTurbo/issues
   - 搜索是否有类似问题

2. **提交新Issue**
   - 标题：`[JSON Parse Error] 简短描述`
   - 内容：包含上述"必需信息"

3. **社区支持**
   - 可以在讨论区提问

---

## 💡 **预防措施**

### **最佳实践：**

✅ **使用推荐的模型和参数**
- 首选 `glm-4-flash`（免费且稳定）
- 场景数量控制在3-5个
- 视频时长15-30秒

✅ **定期检查API Key状态**
- 每90天更新一次Key（智谱要求）
- 监控用量和余额

✅ **保持网络稳定**
- 使用稳定的网络连接
- 如需代理，确保代理可用

✅ **简化输入**
- 使用清晰、简洁的中文描述
- 避免过长或复杂的prompt

---

## 🎯 **总结：排查清单**

在报告问题前，请逐项确认：

- [ ] 已查看终端/控制台日志
- [ ] 已找到并打开 `output/debug/xxx_llm_response.txt` 文件
- [ ] 已验证API Key有效性和余额
- [ ] 已测试网络连接（能访问 open.bigmodel.cn）
- [ ] 已确认模型名称正确（glm-4-flash）
- [ ] 已尝试重新生成（有时是临时性问题）
- [ ] 已收集上述"必需信息"

完成以上步骤后，如果问题依旧存在，请提供详细信息，我会帮你进一步分析！

---

**最后更新时间：** 2026-04-16
**适用版本：** VideoTurbo v2.0+

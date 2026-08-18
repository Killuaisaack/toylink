# 测试

## 自动化检查

```powershell
npm ci
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration
npm run build
npm run verify:build
```

- 单元测试使用合成命令、合成蓝牙配置、假时钟和假连接模块。
- 集成测试覆盖 Intiface 事件转换、自定义蓝牙边界、角色工具和 DOM 安全显示。
- 自动化测试不代表任何真实设备已经兼容。

## 手动无模型流程

1. 打开 ToyLink，确认角色控制为关闭。
2. 连接 Intiface 或导入合成蓝牙配置。
3. 查找设备并明确点击“使用这个设备”。
4. 保持设备自身停止方式可用，执行默认 10% / 0.5 秒测试。
5. 确认自动停止和“立即停止”都有效。
6. 在运行期间断开连接、切换设备和切换聊天，确认 ToyLink 尝试停止并关闭角色控制。
7. 输入超过用户上限的合法数值，确认界面显示降低后的实际数值。
8. 取消确认，确认不会发送运行请求。

## 发布安装流程

仓库发布后，在全新 SillyTavern 环境中通过 Git URL 安装并刷新。不得运行构建命令、复制文件或安装服务器插件。记录 SillyTavern 版本、浏览器版本和安装日期。

# 蓝牙配置格式

ToyLink 的蓝牙配置描述用户已经合法持有的 UUID 和设备指令。它是数据，不是代码。ToyLink 不提供获取厂商协议的方法，也不接受 APK、抓包、反编译内容、凭据或绕过访问控制的说明。

## 版本 1

```json
{
  "profileVersion": 1,
  "name": "合成示例配置（不对应真实设备）",
  "deviceNamePrefix": "Example",
  "serviceUuid": "0000ffe0-0000-1000-8000-00805f9b34fb",
  "writeCharacteristicUuid": "0000ffe1-0000-1000-8000-00805f9b34fb",
  "writeType": "without-response",
  "commands": {
    "stopHex": "550400000000AA",
    "vibrateTemplateHex": "5504000001{intensity_u8}AA"
  }
}
```

此示例完全是合成数据，不能用于任何真实设备。

## 字段

- `profileVersion`：必须为 `1`。
- `name`：1–80 个字符，仅用于用户识别配置。
- `deviceNamePrefix`：1–64 个字符，用于系统蓝牙选择窗口过滤设备。
- `serviceUuid`：服务 UUID，可使用 4 位、8 位或标准 128 位形式。
- `writeCharacteristicUuid`：写入特征 UUID，格式同上。
- `writeType`：只能是 `with-response` 或 `without-response`。
- `commands.stopHex`：必填停止指令，不允许占位符。
- `commands.vibrateTemplateHex`：运行指令，必须且只能包含一个 `{intensity_u8}`。

校验会拒绝未知字段、奇数长度十六进制、未知占位符、缺少停止指令和超过 64 字节的最终指令。强度只有在经过 ToyLink 安全上限处理后，才会映射到 `00`–`FF`。

## 导入与导出

- 导入必须由用户在本地选择文件，文件最大 128 KB。
- 只有完整校验通过后才会保存到 SillyTavern 扩展设置。
- 导出只包含声明式配置，不包含设备对象、连接状态或使用记录。
- 第一次使用每份配置时，ToyLink 会显示最终低强度指令并要求确认。

## 限制

格式正确、GATT 连接成功或写入成功，都不能证明设备会产生预期动作。必须在可以直接停止设备的环境中进行低强度实机验证。

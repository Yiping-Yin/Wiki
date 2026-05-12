# Loom Web Extension · Xcode 接入步骤（60 秒）

我已经写好了所有 web 资源（manifest / background / content / icons / handler / Info.plist）。
你现在需要在 Xcode UI 里把它接成一个真实的 Safari Web Extension target——这一步只能 GUI 完成（手动编辑 pbxproj 加多 target 风险太高）。

## 步骤

1. Xcode 打开 `macos-app/Loom/Loom.xcodeproj`
2. 顶部菜单 **File → New → Target…**
3. 模板选择器：左侧 macOS 标签 → 找 **Safari Extension** → Next
   - （如果看不到，搜索 "safari extension"；选**带 Web Extension 字样**的那个，不是老式的 Safari App Extension）
4. 配置面板：
   - **Product Name:** `LoomWebExtension`
   - **Team:** 跟主 Loom target 同一 team
   - **Language:** Swift
   - **Type:** Safari Web Extension（不是 Safari Extension）
   - **Embed in Application:** Loom（**必选这个**——会自动加 Embed App Extensions 的 Copy Files 到主 app）
   - 取消勾选 "Activate scheme"（不需要单独 scheme）
5. 点 Finish
6. Xcode 创建了一个 `LoomWebExtension` 文件夹，里面有它的默认文件——**全部删掉**（manifest.json / popup.html / background.js / content.js / SafariWebExtensionHandler.swift / Info.plist）
7. 在 Project Navigator 右键 `LoomWebExtension` 文件夹 → **Add Files to "Loom"…** → 选我已经写好的：
   - `Resources/`（整个文件夹拖进去，**勾选 "Create folder references"** 让它变成蓝色文件夹，保持 manifest/JS 路径结构）
   - `SafariWebExtensionHandler.swift`
   - `Info.plist`（如果 wizard 已经创建了，先删掉再加我的）
8. **Target Membership 检查**：选中 manifest.json → 右侧 Inspector → File Inspector → Target Membership → 只勾 LoomWebExtension（不勾 Loom）。每个 Resources 文件都同样确认。
9. **Build Settings → LoomWebExtension target**：
   - `INFOPLIST_FILE` 指向 `LoomWebExtension/Info.plist`
   - `CODE_SIGN_ENTITLEMENTS` 指向 `LoomWebExtension/Resources/LoomWebExtension.entitlements`
   - `MARKETING_VERSION` 设 `1.0.0`
   - `CURRENT_PROJECT_VERSION` 设 `1`
   - `PRODUCT_BUNDLE_IDENTIFIER` 设 `<your-loom-bundle-id>.LoomWebExtension`
10. **Loom 主 target → Build Phases → Embed App Extensions** 应该已经包含 `LoomWebExtension.appex`（wizard 自动加的）。如果没有，手动 Add → 选 LoomWebExtension product。
11. ⌘B 编译。应该过。

## 启用并测试

12. 编译后在 Finder 找到新 build 的 Loom.app（`~/Library/Developer/Xcode/DerivedData/Loom-…/Build/Products/Debug/`）
13. 双击启动 Loom.app（让 LaunchServices 注册它和它的 extension）
14. 退出 Loom（让 Safari 看到 extension）
15. 打开 Safari → Settings (⌘,) → **Extensions** 标签
16. 应该看到 "Capture to Loom" → 给它打勾启用
17. Safari toolbar 上应该出现一个棕色 "L" 图标按钮（Vellum 风格的 placeholder——以后可以换成最终设计）
18. 在任何网页（试 Hacker News）点这个按钮 → Loom 跳前台 → CaptureSheet 弹出，预填的 payload 来自当前页面

## 故障排查

**Extension 没出现在 Safari Settings：**
- 终端跑 `/System/Library/Frameworks/CoreServices.framework/Versions/Current/Frameworks/LaunchServices.framework/Versions/Current/Support/lsregister -f -R "$LOOM_APP"`（替换 `$LOOM_APP` 为实际路径）
- 重启 Safari

**点 toolbar 按钮没反应：**
- Safari → Develop → Allow Unsigned Extensions（仅 dev 模式必需）
- Safari → Develop → Web Extension Background Pages → Loom → 看 background.js console 有没有错
- Safari → Develop → 当前 tab → 看 content.js console

**点了按钮 Loom 没弹：**
- 验证 URL scheme 注册：在 Safari 地址栏粘 `loom://capture?payload=%7B%22title%22%3A%22test%22%7D` 回车
- 如果不弹 = lsregister 没看到新 build，重跑 lsregister
- 如果弹了但 background→content 消息没传到，看 console 错误

## 之后

第一版 extension 跟 v1.2 bookmarklet **下游 pipeline 完全相同**——同样的 payload 格式打到 Loom 同样的 URL scheme handler。所以一旦 extension 能传 payload，CaptureSheet/Reader trim/embedding 全部立即可用。

后续升级（按 ultrathink 决议的优先级）：
- Phase 2: bundle Defuddle (200KB JS 库) 提升 26 站点专属提取质量
- Phase 3: native messaging 替代 URL scheme（突破 URL 长度限制）
- Phase 4: 同一份 JS 代码 manifest 微调 → 提交 Chrome Web Store → Atlas/Chrome/Arc/Brave/Edge 全覆盖

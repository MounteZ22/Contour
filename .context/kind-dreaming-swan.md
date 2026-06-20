# UI 风格优化 Spike — shadcn/ui 探索

## Context

Contour 前端当前所有 UI 组件（Button, Card, Input, Badge, Toast 等）都是手写的 Tailwind class 组合，风格不统一，交互态不完整，缺少复杂组件（Dialog, Select, Tooltip 等）。本次 spike 目标是引入 shadcn/ui 组件体系，替换现有手写组件，验证视觉效果提升。

**范围**：仅视觉/风格层面，不改布局结构、不改业务逻辑、不改用户操作流程。

## 技术前提

- 项目路径：`D:\Github_repository\Contour\contour-web\frontend`
- React 19 + Vite 7 + Tailwind CSS v4（@tailwindcss/vite 插件）
- 无 path alias（需要新增 `@/` → `src/`）
- 无 shadcn/ui 配置（需要全新安装）
- 现有 token 体系：M3 风格 CSS 变量，定义在 `src/styles/tokens.css`

## 实施步骤

### Step 1: 基础设施搭建

1. **添加 path alias**
   - `vite.config.ts` — 添加 `resolve.alias`
   - `tsconfig.json` — 添加 `paths` 和 `baseUrl`

2. **安装 shadcn/ui 依赖**
   - `npm install class-variance-authority clsx tailwind-merge`
   - 创建 `src/lib/utils.ts`（shadcn 标准 `cn()` 工具函数）

3. **配置 shadcn CSS 变量**
   - 在 `tokens.css` 中追加 shadcn 变量映射（`--background`, `--foreground`, `--primary` 等）
   - 映射到现有 M3 token，保持兼容

### Step 2: 安装 P0 组件

手动创建以下组件到 `src/components/ui/`（shadcn 方式：源码安装）：
- **Button** — 替代所有手写按钮
- **Input** — 替代所有手写输入框
- **Card** — 替代手写卡片容器
- **Badge** — 替代 StatusBadge 的基础样式
- **Label** — 表单标签
- **Separator** — 分割线

### Step 3: 替换关键页面组件

逐个替换，保持功能不变：

| 文件 | 替换内容 |
|------|---------|
| `AppShell.tsx` | header 按钮 → Button variant="ghost" |
| `FlowCard.tsx` | 卡片 → Card，删除按钮 → Button variant="ghost"，StatusBadge → Badge |
| `DashboardPage.tsx` | 项目列表按钮 → Button，输入框 → Input，卡片 → Card |
| `SettingsPage.tsx` | 导航按钮 → Button variant="ghost" |
| `BottomChatPanel.tsx` | 输入框 → Input，发送按钮 → Button |
| `StatusBadge.tsx` | 内部样式改用 Badge variant |
| `Toast.tsx` | 基于 shadcn 风格微调 |
| `App.tsx` | loading/error 按钮 → Button |

### Step 4: 多主题基础

- 扩展 `state/theme.ts`，新增 2-3 套主题选项（Emerald, Violet）
- 在 `tokens.css` 中新增对应 `.theme-emerald`、`.theme-violet` class
- ThemeToggle 组件已有，自动支持新主题

### Step 5: 视觉验证

- 启动 dev server（`npm run dev`）
- 逐页检查：Dashboard、FlowWorkspace、Settings
- 对比替换前后效果

## 关键文件

- `contour-web/frontend/vite.config.ts` — 添加 alias
- `contour-web/frontend/tsconfig.json` — 添加 paths
- `contour-web/frontend/src/styles/tokens.css` — CSS 变量扩展
- `contour-web/frontend/src/lib/utils.ts` — 新建 cn() 工具
- `contour-web/frontend/src/components/ui/` — 新建，shadcn 组件
- `contour-web/frontend/src/components/*.tsx` — 替换为使用 shadcn 组件
- `contour-web/frontend/src/pages/*.tsx` — 替换为使用 shadcn 组件
- `contour-web/frontend/src/state/theme.ts` — 扩展多主题

## 验证方式

1. `npm run dev` 启动，访问 http://localhost:3000
2. 检查 Dashboard 页面：项目列表、Flow 卡片、文档卡片、聊天面板
3. 检查 Settings 页面：导航、表单输入
4. 切换主题（Light/Dark + 新增主题），确认色彩正确
5. `npm run build` 确认无编译错误

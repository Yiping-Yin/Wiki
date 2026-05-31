# Loom — 完整讲述

**版本** 1.1
**日期** 2026-05-08
**状态** 经四次澄清后定调（三能力 / flipdisc / Cursor for thought / 本地文件）

> 本文档是 Loom 所有未来产品决策的引用基准。任何新 feature PR 必须能用本文档的语言 declare：
> 1. 它服务三能力中的哪一个？
> 2. 它对应哪个 surface？
> 3. 它通过 5 条 Discipline 检查吗？
> 4. 它经过 flipdisc + Moodle 试金石吗？

---

## Frontispiece — 一句话

**Loom 是一座你的私人档案室，你在外部世界遇到的东西被完整带回家；它们在屋子里被整理、被照看；最后你在一张空白页上、和 AI 一起、用这些素材写下真正属于你的东西。**

它不是 RSS 阅读器，不是稍后读，不是笔记软件，不是 Notion 的山寨版，也不是又一个 ChatGPT 包装。

它是上面那句话里描述的**一个动作的循环**：**收集 → 整理 → 写**。三件事彼此咬合，循环往复。

最简短的产品比喻：

> **Cursor for thought, on your captured world.**

---

## Plate I — 三件事

Loom 一共做三件事，**只做这三件事，做透**。

### 1. 信息收集（Gathering）

**它要做的**：把你在外部世界遇到的多富态对象**完整带回家**。

「完整」是关键词，「多富态」是关键限定。文字 + 链接是不够的。

> 一篇 flipdisc.io 教程的真正含金量，不在英文段落里。在那张能切 Frame / Board / Power / Data 四态的接线图里、在那个能拖动看 Floyd vs Bayer 哪个崩得快的滑块里、在那个一键编辑就同步五行的 Pixel Font 比较器里。**这些非文字信息就是知识本身**。

所以 Loom 的 capture 不能是"抓篇文章"。它要识别 source 里的**结构化交互单元**（input-mirror / comparison-slider / segment-diagram / animated-canvas / source-island），把它们各自存为可被引用的 artifact。

**两条平行的入口**：

- **Web capture**（浏览器扩展） —— 抓富态网页
- **Local file import**（拖入 / 文件菜单） —— 抓 PDF / PPT / DOCX / MD / 图等

详见 [Plate II — 多源 corpus](#plate-ii--多源-corpus)。

**它解决的根本问题**：让用户的私人 corpus 富态到 AI 在写作时**真的能用**。索引能找到的不只是"flipdisc 教程提到了 dithering"，还能精确到"那个 slider 在 0.4 位置时 Bayer 在脸部如何溃成方块"。

### 2. 信息整理（Organizing）

**它要做的**：在已经收集到的东西上**加结构** —— quote、tag、connection、pursuit 归属、年回顾、wintering 归档。

整理不是打标签的体力活。它是回答这些问题：

- **这一段里我最在意哪几句？** —— quote
- **这条 capture 跟过去半年的什么连得起来？** —— connection
- **它属于我哪一个长期问题？** —— pursuit
- **它该 hold（留下）还是 flow（让它过去）？** —— what flows / what holds
- **一年了，我从这堆 capture 里真正记住了什么？** —— Year in review
- **这条暂时不读但不删，明年再说** —— wintering

所有这些都是**让你和 AI 都能更精准地引用 corpus** 的服务动作。整理不是目的 —— **整理是为下一步（思维草稿）准备弹药**。

### 3. 思维草稿（Drafting with AI）

**它要做的**：在一张空白页上，**你和 AI 一起**用收集 + 整理出来的素材，**写真正属于你的东西**。

继承 Cursor 的 8 条 UX 公理，从代码场景翻译到写作场景：

| Cursor 公理 | 思维草稿对应 |
|---|---|
| AI 默认知道整个 repo | AI 默认索引你整个 capture corpus（含 artifacts、含本地文件） |
| AI 织在每个动作里 | ⌘K 改这段 / Tab 接受续写 / ⌘L 在 corpus 上聊 |
| `@` first-class | `@flipdisc-tutorial` / `@quote-id` / `@artifact-state` / `@moodle-econ-w4:p7` 一键拉进 context |
| streaming 在光标处 | AI 写新段落直接在你光标位置流式生成 |
| diff 默认呈现 | AI 改你已经写的段，给 diff，accept/reject |
| Composer 多块编辑 | 跨多个 pursuit 重组 / 重排 |
| predicted next action | AI 预测你想引用什么、想接着写什么 |
| 持久 + 可返回 | 草稿是 markdown 文件，明年回来还在 |

**它解决的根本问题**：把你这两年读过的东西、想过的事，**变成你自己的输出**。让 corpus 的价值真正兑现 —— 而不是在 capture 库里发霉。

### 三件事的耦合

这三件事**不是流水线**，是**互相塑造的循环**：

```
        ┌──────────┐
        │  收集 1  │
        │ 多富态抓 │
        └─────┬────┘
              │ 喂养
              ▼
        ┌──────────┐
        │  整理 2  │
        │ 加结构   │
        └─────┬────┘
              │ 服务
              ▼
        ┌──────────┐
        │ 思维草稿 │
        │  3 + AI  │
        └─────┬────┘
              │ 反馈
              │ "我想引用这种东西，但我没法引用"
              │ "我要的角度，corpus 里没有"
              ▼
       回到 1，调整收集什么
       回到 2，调整怎么整理
```

- **收集决定了整理的天花板**（没抓到的信息你整理不出来）
- **整理决定了草稿的精度**（结构化得粗糙，AI 引用就模糊）
- **草稿决定了未来收集的方向**（写到一半发现某类素材缺，下次去主动抓）

**三件事必须同时打磨**。这是产品的真正心跳。

---

## Plate II — 多源 corpus

Loom 的 corpus 不是 web-only。学生从 Moodle 下载 PDF、研究生收到 conference 论文集、设计师在 Pages 写完 brief —— **这些都不经过浏览器**，但和 web capture 来的东西**地位完全相同**。

只懂 web capture 的工具会**把你 corpus 的真实形状切掉一半**。

### 本地文件支持清单

| 来源格式 | Loom 处理 | 优先级 |
|---|---|---|
| **PDF**（学术 + Moodle 主力） | 文本抽取 + OCR 兜底 + 保留原档 + PDF.js 渲染 | **P0** |
| **PPTX / Keynote** | 逐页截图 + 每张 slide 是独立 artifact + 文字抽取 | **P0** |
| **Markdown** | 直接 import | **P0** |
| DOCX / Pages | Pandoc 转 MD + 保留原档 | **P1** |
| 图片（PNG/JPG/HEIC） | OCR + alt-text + 保留原档 | **P1** |
| EPUB | 章节拆分 + 文字抽取 | **P2** |
| 音频 / 视频 | Whisper 转写 + 链接源文件 | **P3** |
| Apple Notes | 显式授权同步 | **P3**（已确认） |
| Moodle / Canvas LMS API | 直接拉课件 / 作业 | P3+ |

### Origin 抽象

每条 corpus 成员有 `origin` 字段：

```ts
type Origin =
  | { kind: 'web'; url: string; captured_at: string;
      capture_engine_version: string }
  | { kind: 'local-pdf'; original_path: string;
      original_mtime: string; imported_at: string;
      sha256: string; page_count: number }
  | { kind: 'local-pptx'; original_path: string;
      original_mtime: string; imported_at: string;
      slide_count: number }
  | { kind: 'local-docx'; original_path: string;
      original_mtime: string; imported_at: string }
  | { kind: 'local-image'; original_path: string;
      original_mtime: string; imported_at: string;
      ocr_lang?: string }
  | { kind: 'local-md'; original_path: string;
      original_mtime: string; imported_at: string };
```

**铁律**：

- **整个 corpus 上层 API 不区分 origin** —— 搜索、tag、quote、reference、embedding 全部 generic
- **只有 Cover surface 和 citation 渲染区分 origin**

AI 在写作时**根本不知道**你引用的是 web 还是本地。这才是 Cursor for thought 的真正含义 —— **AI 看你整个工作世界，origin 是 implementation detail**。

### 课程归档：用 tag，不发明新 entity

Moodle 课件不需要新的 `course` 或 `dossier` 概念。**普通 tag 就够**：

```
#econ-101-spring-2026
#econ-101-w4-production-functions
#thesis-research
```

理由：
- tag 已经支持跨 capture 筛选
- tag 已经支持权重 / 颜色（未来可加）
- 不发明新 entity = 整理层认知负担更低
- 同一个 tag pattern 适用于课程、项目、读书会、自定义分组

### `@` 引用语法

引用必须 origin-agnostic + 支持页 / slide 锚点：

| 语法 | 含义 |
|---|---|
| `@flipdisc-tutorial` | web capture 全文 |
| `@flipdisc-tutorial#floyd-bayer-slider:0.4` | 那个 slider 在 0.4 位置时 |
| `@moodle-econ-w4-slides` | 整个 PPT |
| `@moodle-econ-w4-slides:p7` | 第 7 张 slide |
| `@thesis-draft.pdf:p23` | PDF 第 23 页 |
| `@thesis-draft.pdf:p23-25` | PDF 第 23-25 页范围 |
| `@meeting-notes-mar-15.md#decisions` | MD 文件特定 heading |

**Citation 渲染区分 origin**：

```
[^1]: ECON 101 — Lecture 4: Production Functions, slide 7
      (Moodle, downloaded 2026-03-15)
[^2]: flipdisc.io — Flipdiscs Display Build Guide
      (web capture, 2026-04-22)
[^3]: thesis-draft.pdf, p. 23
      (local file, last modified 2026-04-30)
```

---

## Plate III — Discipline · 六条 Refusals

最重要的产品决定不是说做什么，是说不做什么。

设计版面里的「Discipline — the four refusals, illuminated」（v3 起）+「What flows, what holds — the fifth refusal」（v7 加上）+ 本地文件引入的隐私拒绝（第六条）= **六条产品宪法**。

### Refusal 1. 不监视你

Loom 不发遥测、不收 analytics、不知道你读过什么 capture、不知道你点过哪个 quote。
所有数据本地。AI provider 调用是显式的、可关闭的、可换的。
**你的 corpus 是你的，结束**。

### Refusal 2. 不打断你

Loom 不发通知、不弹徽章、不有"未读"红点、不发邮件提醒你"你这周还没回到这条 capture"。
Loom 是**你主动回来的地方**，不是**它来叫你的地方**。

### Refusal 3. 不假装比你懂

AI 不替你下结论。AI 不强行 summarize。AI 不在你没问的时候提建议。
AI 是你召唤来才出现的副驾驶，不是后座司机。

### Refusal 4. 不把你的东西拍平成 feed

Loom 不是时间线、不是 home feed、不是 explore page。
没有"算法推荐你可能喜欢的 capture"。
你的 corpus 是**有重量的、有姿态的、有体系的**，不是流动的内容池。

### Refusal 5. 不假装一切都该被永久保存（What flows, what holds）

不是所有抓回来的东西都该留一辈子。Hacker News 评论、tweet、即时新闻 —— 是 **flow**，应带着自然衰减。
认真读完的书、重要 dithering 教程 —— 是 **hold**，要留。
Loom 知道两者的区别，**Wintering 机制**让 flow 自然褪色、让 hold 长存。

### Refusal 6. 不主动上传本地文件全文

Loom 默认对本地文件做 embedding 索引（向量是抽象的），但**全文不主动上传**。

只在你显式 `@reference` 那一刻、且**显式发起 AI 请求**时，那个文件全文才进 AI context。

> 等价于：你授权一次，发一次。AI 不存档。

这是 Refusal #1 的延伸，但因为本地文件可能比 web capture 敏感得多（学校作业、合同、私人照片），值得单独强调。

---

> 这六条不是 marketing。是产品宪法。**任何新功能 PR 都必须先过这六条**。如果一个新功能违反任一条，它不上线。

---

### Amendment 2026-05-11 — §III.7 命名纪律 · 直译 over 隐喻

Yiping 在 2026-05-11 (PR #20 review 现场) 正式 ratify 第七条 Discipline：

> 「离开特色的隐喻我觉得是对的方向，因为过多的隐喻会影响直观的使用上手难度，直译的语言和单词会让人更明白说对应的功能。」

**结论：UI vocabulary 用直译动作词，不用 *kesi* 隐喻。**

Current shipped vocab (2026-06-01 canonical visible model):
- **Surface vocabulary**：`Sources / Draft`
- **Supporting labels**：`Capture / Question / Folder / Recent Reading / Continue Writing / Add files / ADDED / No files added yet.`
- **Superseded historical vocabulary**：`Collect / Organize / Draft` was the 2026-05-11 running-app vocabulary and must not be presented as the current shipped surface model.

Historical shipped vocab (2026-05-11 在 running app 现场验证, superseded):
- **三大 surface**：`Collect / Organize / Draft`（即 Plate I 三能力的直译；现已由 `Sources / Draft` 取代）
- **名词**：`Capture / Source / Folder / Question / Recent Reading / Unorganized / Local Files / Reader Notes / Question Containers / Continue Writing`
- **动作**：`Add files / Add Folder / Add Question / Capture to Loom`

弃用 (v3–v4.1 历史 vocabulary、记忆 + 旧 canon 中仍残留)：
- `Shuttle / Weaves / Sōan / Pursuits / Patterns / Rehearsal / Examiner / weaver / panel`
- *kesi* 通经断纬 隐喻保留作**起源叙事和 internal code 命名**（如 `InterlaceInstaller` 类型），但**不进用户面 copy**

**作用范围**：新增 UI string、新增 surface 名、新增 CTA、新增 menu item、新增 status 文案。**Internal 类名 / 包名 / 文件名不受此条约束**。

**追溯清理**：根目录 `LOOM.md` / `LOOM_RULES.md` / `docs/design/*` 多处仍用 *kesi* vocabulary —— 标为 stale，followup sweep PR 单独处理，**不阻塞**当下工作。

**为什么这是 Refusal 而不是 Style Guide**：命名是产品教学的第一道关。一个"Pursuit"按钮强迫用户先学 Loom 术语再用功能；一个"Add Question"按钮直接让功能露出来。前者是 onboarding 税，后者不是 —— 而 Plate III 的精神正是**不向用户征收任何不必要的税**。所以它属于宪法，不属于风格。

---

## Plate IV — 19 个 Surface 全景图

设计语言（Vellum II → IX）累计命名了 19 个产品 surface。它们按三能力分组如下。

### 服务于「信息收集」

| Surface | 功能 |
|---|---|
| **Cover** | 一份 source 的封面（web → URL/site；local → 文件名/课程/作者元数据） |
| **Source / The page** | "a passage marked, in pencil" —— 单条 capture 的 reader |
| (隐性) **Capture engine** | content.js + bridge + local importer —— 用户看不见但每次抓取都跑 |

### 服务于「信息整理」

| Surface | 功能 |
|---|---|
| **Atlas** | "the whole product on one sheet" —— 你 corpus 的全景图（含 web + local） |
| **Contents** | "a reader's map" —— 当前你在哪、附近还有什么 |
| **Connections / Correspondents** | source 来源人 + 关系网；跨 origin 的连接 first-class |
| **Wintering** | "locked, kept, returned to" —— 第三状态：不读不删，等下个冬天 |
| **The Year** | "twelve columns, one ribbon" —— 一年的回顾，按分量不按数量 |
| **The Hour, ticking** | "live watch, live page, breath bar" —— 此刻你在想什么 |
| **What flows, what holds** | flow vs hold 的分类 |

### 服务于「思维草稿」

| Surface | 功能 |
|---|---|
| **The Study** | "lamp, journal, pen, ink" —— 主写作面 |
| **Atelier** | "four books tiled, one hand writing" —— 多 source 平铺工作模式 |
| **Pursuits** | "eleven questions held at different weights" —— 长期问题的容器 |
| **The Sealed Letter** | "what writing is, here" —— 你写给自己的私密文 |
| **Reading hour** | "focus mode, no chrome" —— 专注模式 |
| **Shuttle ⌘K** | "every verb in the loom, on one card" —— 命令面板 |
| **Interlace ⌘/** | "summons the weaver" —— 跨 corpus 链接生成 |

### 身份与边界

| Surface | 功能 |
|---|---|
| **Frontispiece** | 大门 —— Loom 自己的封面 |
| **Dedication** | "for the reader who returns" —— 老用户的回家 |
| **Discipline** | 六条 refusals 的成文呈现 |
| **Working mode** | "the version you show someone" —— 公开版（屏蔽私密内容） |
| **Specimen / Colophon** | 标本 + 版权页 —— Loom 给自己留的笔迹 |

**关键事实**：本地文件**不需要新 surface**，全部 fits into 上面 19 个。只有 Cover 和 citation 渲染显示 origin 区别。

---

### Amendment 2026-05-12 — Sidebar / List 交互语法（Plate IV addendum）

**来源**：2026-05-12 评估了一份 component-library showcase 风格 sidebar 原型（Unlumen UI Pro 风格）。整体视觉风格与 Plate VII（Cormorant + 牛血红 + Vellum）和 Visual Grammar §8（禁止 mechanism-calling 动画）系统性冲突，**不采纳整体风格**。但其中 4 条交互模式与产品视觉无关，作为通用 UX 抽出，落为所有 list-shaped Plate IV surface 的交互基线。

**A. 键盘 ↑/↓ 在可见 item 间切换 + 自动滚动入视区**

任何 list-shaped surface（sidebar 文件夹列表、Recent Captures、Recent Reading、Question Container 列表、Source Index 等）**MUST** 支持键盘 ↑/↓ 在 visible item 间切换 focus；焦点移出当前 viewport 时自动 scroll 该 item 入视。

理由：a11y baseline + 鼠/键双模流畅。

**B. 分组 header 折叠可选，但 count badge 禁止**

当 sidebar / list 出现 group header（如 `FOLDERS` / `Today` / `Pinned`），header **MAY** 支持点击折叠，用 caret 90° 旋转 + body max-height 过渡。**MUST NOT** 在 header 旁边显示 count badge（例如 "Components 12 / Animations 24 / Hooks 8"）—— 这违反 Visual Grammar §7「Counts are almost always overused」。如果用户需要知道数量，让数量出现在 detail view 内，不进导航 chrome。

**C. 选择切换允许细微 fade（≤150ms），禁止 mechanism-calling 动画**

切换 selected item 时，content pane 的 title / description / preview **MAY** 用短 fade（opacity 0.6 → 1，≤150ms）。**MUST NOT** 使用：

- 彩色渐变扫光（gradient text-reveal sweep）
- 右侧滑动 indicator（sliding bar follows cursor）
- 左侧 dash 生长 + 同步变色（width + color 双过渡）
- bounce / slide choreography 任何形式

这些都属于 Visual Grammar §8 明令禁止的 "calls attention to the mechanism"。

**D. ⌘K 是唯一全局召唤层（重申，不重定义）**

参考 Plate IV 已规划的 M6/M7 ⌘K palette。**复用此约束**：所有「快速跳到 / 快速创建 / 快速搜索 / 快速 invoke AI」收敛到 ⌘K 这一个入口，**不**在 sidebar 顶部、各 surface 顶端再放一个独立 search input。Sidebar 自己不需要 search box —— 列表本身已经是导航。

---

**总原则（写给未来 PR）**：评估任何「借鉴某产品 X 的 sidebar / nav 风格」提案时，按这三道闸：

1. 这条 pattern 是 *visual / material*（字号、颜色、密度、字形）还是 *interaction*（keyboard、scroll、selection logic）？前者绝大多数与 Plate VII 冲突，跳过；后者可以单独抽出。
2. 涉及的动画属于「settle / quiet fade」还是「showcase the mechanism」？后者一律 reject。
3. chrome 是否显示 count / status badge / progress 这类不属于当前 task 的元信息？是 → reject。

通过三道闸的 pattern 才是真正可借鉴的；其余是 Unlumen / Notion / 某 SaaS 截图的产品定位绑定的样式，不属于 Loom。

---

## Plate V — flipdisc + Moodle 试金石

Loom 是不是真做对了，**不看代码，看两个真实场景**。

### 场景 A: flipdisc.io（多富态 web）

把 https://flipdisc.io 这个网站 capture 进 Loom，**完整跑一轮三能力**：

#### 收集环节
- ✅ 全文内容
- ✅ Vimeo 视频引用（保留 ID + 标题，不嵌内联）
- ✅ Frame / Board / Power / Data 四态接线图，**每一态独立 artifact**
- ✅ Floyd-Steinberg vs Bayer 滑块在 reader 里**真的可拖**
- ✅ Pixel Font Comparison 输入框可编辑，**改"jazz"四个字 → 5 行字体同步**
- ✅ 8 幕 animated scene canvas 全部进入 corpus
- ✅ "Frame Format `0x80 0x83 0x01 imageData 0x8F`" 识别为 segment-diagram

#### 整理环节
- ✅ 选 Floyd-Steinberg slider 在 0.4 位置时**那一帧** → 保存为 quote
- ✅ tag 这条 capture 为 `#dithering` `#hardware-display`
- ✅ link 它跟另一条 dithering 教程 capture 为 `connection`
- ✅ 把它归入 pursuit `2026-flipdisc-display`

#### 草稿环节

用户打开 Pursuit `2026-flipdisc-display` 的草稿页，写：

```
我考虑用 flipdisc 做办公桌上的环境显示器。
@flipdisc-tutorial 提到 25-60fps 是合理的；
但我担心 dithering 在这种低分辨率上崩成块。
```

光标停在「崩成块」后面 → AI 自动建议：

```
正如 @flipdisc-floyd-bayer-slider:0.4 显示，
Bayer 在中间调时几乎全部塌成方块阵列，
而 Floyd-Steinberg 还能保留眉骨的曲线。
```

→ Tab 接受。

### 场景 B: ECON 101 + Moodle（异质源）

用户从 Moodle 下载 `ECON-101-Lecture-4.pptx` + `Problem-Set-4.pdf`：

#### 收集（local）
- ✅ 拖进 Loom → 两个文件入库
- ✅ PPT 逐 slide 抽取 + 截图
- ✅ PDF 文本 + OCR + 原档保留

#### 整理
- ✅ tag PDF 为 `#problem-set-due-friday` `#econ-101-spring-2026`
- ✅ tag PPT 为 `#production-functions` `#econ-101-spring-2026`
- ✅ 已有 web capture：`@cobb-douglas-explainer`（一篇 medium 文章）
- ✅ 三个 source 都归入 pursuit `2026-spring-econ`

#### 草稿（异质源协作）

进入 Pursuit `2026-spring-econ` 草稿页，写：

```
教授在第 4 周强调 Cobb-Douglas 函数的长期均衡有几个反直觉的特性...
```

光标停下 → AI 建议（已读完所有源 — PPT + PDF + medium 文章）：

```
正如 @moodle-econ-w4-slides:p11 给出的 isoquant 图所示，
α + β = 1 时规模回报恒定 —— 这点在 @cobb-douglas-explainer 
里被特别拆解（"hidden constraint of constant returns"）。
但 @problem-set-4.pdf:p2 第 3 题给的参数组（α=0.6, β=0.5）
故意违反这个条件，意图考察规模递增情形下的 long-run。
```

→ Tab 接受。**citation 区分三种 origin，但 AI 引用时统一调用**。

### 通过条件

- 场景 A 完整跑通 = web 多富态收集 + 整理 + 草稿 OK
- 场景 B 完整跑通 = 异质 corpus 真正打通

**两个都过 → Loom 真的 work**。
**任何一步断链 → Loom 这部分有 bug 或没建好**。

flipdisc + Moodle 不是 demo，是**永久 regression 测试**。每次 release 前过一遍。

---

## Plate VI — 跟相邻产品的精确差异

| 工具 | 它有的 | Loom 有但它没有的 |
|---|---|---|
| **ChatGPT** | 通用智能 | 你的私人 corpus；持久写作面；多富态引用 |
| **Notion** | 块编辑器；轻协作 | 富态 capture；AI 默认知道你整库；letterpress 美学；本地文件 import |
| **Notion AI** | bolt-on 智能 | AI-native 交互（不是按钮）；artifact-state 引用 |
| **Obsidian** | markdown vault；graph；插件 | 默认 AI；多富态抓取；在线 corpus 索引；本地文件智能化（不只是放 vault 里） |
| **Pocket / Instapaper** | 稍后读列表 | 整理 + 写作；多富态保留 |
| **Overleaf / LaTeX** | 学术排版 | AI 写作伴侣；一般人也能用 |
| **Cursor** | AI 写代码的全部体验 | gathering 层；本地文件 + web capture 都是 first-class；多富态 corpus；时间感（wintering / year）；物质美学 |
| **Word** | WYSIWYG 几十年 | 不需要点几十层菜单（AI 替你做） |

**Loom = (web capture + 本地 file importer + 私人图书馆) × (Cursor for thought)**

这个乘法不是堆砌。是因为 **gathering 层和 organizing 层为思维草稿提供 AI 默认上下文**，所以三层乘起来才是 Loom。**少任何一层都退化成现有产品**。

---

## Plate VII — 物质美学（Vellum + Cormorant）

Loom 不是 chrome-style SaaS dashboard。它的视觉宪法在 `Material Audit.html`：

> **The grain of things.**
> I · Books · II · Paper & Letters · III · Cloth · IV · Wood & Light · V · Implements

### 字体

- **Cormorant Garamond** —— 主字体，italic-prone 衬线，书坊气
- **IBM Plex Mono** —— 数据 / 元信息 / 引用块

### 颜色

| 用途 | 值 |
|---|---|
| Paper（米色纸张） | `#F4EFE6` |
| Paper-2（深一档米） | `#EDE6D8` |
| Ink（暖深褐，非黑） | `#1B1612` |
| Ink-2 | `#3A322B` |
| Rule（淡分隔线） | `#C9BFAE` |
| Accent（牛血红 / 油墨晕） | `#8C2A1C` |
| Cosmic background | `#0E0B08` |

### 为什么这个美学

知识工作配得上**一个安静的器物**，不是一个吵闹的 SaaS 工具。

- Cormorant 不是装饰，是**态度**：它说"这里慢一点"
- 牛血红不是装饰，是**强调**：它说"这一段重要，但不是 marketing 的'重要'"
- 米色不是装饰，是**邀请**：它说"在这里写久一点没关系"

> 设计的反命题不是"难看"，是"中立"。Loom 不要中立。它要**有态度的安静**。

---

### Amendment 2026-05-13 — §VII.bis 默认形态纪律（Default Surface Discipline）

**来源**：Yiping 2026-05-13 review 现场（在评估了几个候选 sidebar 样式之后）正式 ratify：

> 「不能把页面摊开的到处都是。一个成熟的产品应该是简单使用，但是效果惊人。」

这是 Plate VII 物质美学的**结构对应面**：物质美学讲"长什么样"，默认形态纪律讲"摆什么、不摆什么"。两条共同回答 Cursor for thought 的核心问题：**用户打开 Loom 那一刻看到的是工作面，不是 onboarding shell**。

**作用范围**：Plate IV 全部 19 个 surface，无例外，无新老豁免。

#### §VII.bis.1 正面规则 — Single Foreground

每个 surface **MUST** 有恰好一个 foreground object。surface 内部 organize 成三层：

| Tier | 角色 | 判定 |
|---|---|---|
| **Foreground** | 用户当前正在操作 / 阅读 / 写作的主对象 | 最大字号、ink1、占视觉中心 |
| **Secondary** | 辅助 foreground 的面板 / 列表 / 工具 | **任一**：字号 -1 档 / 颜色 ≤ink2 / 视觉面积 ≤ foreground 40% |
| **Chrome** | toolbar / breadcrumb / status strip | **全部**：字号 ≤ tertiary / 颜色 ≤ ink3 / 位置在顶或边缘 |

**审查测试**：Reviewer 在 PR 评论里问「这个 surface 的 foreground 是什么？」—— 5 个字内回答不出来 → fail。

参考样本：

- ✅ Draft：foreground = textarea。右栏 Sources/Edit/Board = secondary。toolbar = chrome。
- ❌ 当前 Collect：6 张同等视觉权重的卡片，foreground 答不出。
- ❌ 当前 Organize：5 个 stats badges + 5 columns of cards，foreground 答不出。

#### §VII.bis.2 反面规则 — Subtraction

下列内容 **MUST NOT** 出现在任何 default surface（用户首次到达该 surface 时的状态），每类必须迁到指定降落点：

| 内容类型 | 降落点 |
|---|---|
| 教学 copy（怎么装扩展、Capture flow 4 步说明、bookmarklet 使用提示） | Help menu **或** 一次性 first-run overlay |
| Pipeline status（embedding 模型加载情况、indexed count、active workspace 数） | Settings > Pipeline |
| Storage config（sandbox 路径、Reveal in Finder、Move to…） | Settings > Storage |
| 空态占位（"No local files yet" / "No reader notes yet" / "No question containers yet"） | **panel 直接不渲染** —— 有内容才出现 |
| 任何 configuration control（preference、provider 切换、theme） | Settings drawer |

#### §VII.bis.3 Cold-start 与 First-run

- **First-run**（用户第一次打开 Loom）：一次性 welcome overlay 覆盖主 pane，dismiss 后**永不再现**。
- **Cold-start with non-empty corpus**：surface resume 到上次状态：
  - Draft = last draft
  - Collect = last viewed capture（或 inbox top）
  - Organize = 当前 active Question（或最近一条 unorganized capture）
- **Cold-start with empty corpus**：每个 surface 显示 1-line prompt + 1 primary action，不分卡片。例如：
  - Collect: "Drop a file or click L on a webpage." [Add files]
  - Organize: "Captures get organized here once you have them." [Capture]
  - Draft: textarea 直接打开，无 helper text

#### §VII.bis.4 Per-surface 迁移清单（codebase-grounded, 2026-05-13 投影）

**LoomLibraryView (Sources / Organize 类似面)** — 接近合规但需小修：

- foreground = `rootGrid` list ✅
- header 上的 "N page(s)" count → 删除（违 §VII.bis.2 count badge in chrome）
- empty state 的纯文本 "Use the sidebar's + Page or + Folder" → 加 primary action 按钮（符 §VII.bis.3 empty-corpus = 1 prompt + 1 primary action）

**WebCaptureSetupView (Web Capture 设置面)** — 完全不合规，整体 **拆除**：

- 6 张卡片全部是 教学/状态/配置 —— 没有 foreground 候选
- 4 张教学卡 (extensionInstallCard / installCard / captureFlowCard / tipsCard) → `Help > Set up captures…` 菜单项打开 `CaptureHelpView` 窗口
- 1 张配置卡 (storageCard) + 1 张状态卡 (pipelineStatusCard) → Settings 第 4 个 tab "Capture" (`CaptureSettingsView`)
- WebCaptureSetupView 本体 struct + sidebar `Web Capture` entry 删除

**Draft surface** — 当前 codebase **不存在**。先前 spec (2026-05-13 早版) 误把概念稿截图当作 shipped 代码。该 surface 留待 Phase X 设计 + 实现，标记为 §VII.bis.7 待补章节。建成时按 §VII.bis.1 (single foreground = textarea) + §VII.bis.3 (cold-start = last draft) 设计，作为 Plate VII-bis 的样板。

**其余 16 个 Plate IV surface** — 每个 PR 单独按 §VII.bis.1–3 declare，本计划不覆盖。

#### §VII.bis.5 审查规则（写给未来 PR）

任何动 Plate IV surface 的 feature PR 必须在 description 中显式 declare：

1. 该 surface 的 foreground object 是什么？
2. secondary 元素有哪些，每个过的是哪一项 subordinate-check（字号 / 颜色 / 面积）？
3. chrome 元素有哪些？
4. 该 surface 默认状态下含 教学 / 状态 / 空态 / 配置 内容吗？含 → 直接 reject。

不能 declare 即 PR 不合规，无论功能多正确。

#### §VII.bis.6 与 Plate VII 物质美学的关系

物质美学（Cormorant + 牛血红 + Vellum + 安静）讲 surface **长什么样**。默认形态纪律讲 surface **摆什么、不摆什么**。两条都满足才算"有态度的安静" —— 物质美学单独存在会变成"漂亮的 dashboard"；默认形态纪律单独存在会变成"裸露的工具"。

**Cross-refs**：

- Plate III Refusals（6 条 + §III.7 命名纪律）
- Plate IV 19 surfaces + Plate IV addendum 2026-05-12 sidebar/list 交互语法
- `docs/design/CURRENT_DESIGN_CANON.md` §3 Attention Contract（本 amendment 是它的 hard tightening：把"应当有一个 foreground"升格为"MUST 有 + 三层结构 + 反面禁令"）

---

## Plate VIII — 当前状态 + 工程顺序

### 已经在跑的两条线

#### Claude（Phase 4-5 · 整理 + 草稿基础）
- ✅ Save quote · 在 capture 里选段保存
- ✅ Tag · per-quote 标签 + 跨 capture 标签筛选
- ✅ Quote 跨 capture 视图（captures landing 里的 Quotes pivot）
- ✅ Synthesize themes · per-capture + cross-capture（雏形）
- ✅ Copy quote as markdown
- ✅ pivot / tag / search 状态持久化
- ❌ 一切草稿层（持久空白页 / `@cite` / inline ⌘K / Pursuits 容器 / 本地文件 import）

#### Codex（收集层架构重写）
- ✅ InteractiveArtifact 契约定义
- ✅ input-mirror / comparison-slider / segment-diagram 三类 artifact
- ✅ flipdisc 状态 class 冻结 + 截图
- ✅ snapshot iframe 高度锁
- ⚠️ 4000+ 行未 commit（process 风险）
- ⚠️ 把 captures landing 默认切到 SwiftUI native（**与思维草稿的 web 美学方向冲突，应该 revert**）
- ❌ animated-canvas / source-island 容器
- ❌ 本地文件 importer

### 下阶段优先级（基于本讲述）

#### Phase 6（最高）—— 思维草稿 MVP（含本地文件）

1. **草稿页**：能新建 / 保存 / 返回的 markdown 持久编辑器
2. **AI 默认索引整个 corpus**（embedding，含 web + local）
3. **`@` 引用 origin-agnostic**，支持 page / slide 锚点
4. **⌘K inline edit**：选段 → 让 AI 改 → diff 接受
5. **`/draft from #tag`** streaming
6. **Drag-to-import**：PDF / PPT / MD / 图片 入库（P0 格式）

#### Phase 7 —— Pursuits 容器

1. `pursuits/<slug>/` 目录结构
   ```
   pursuits/
     2026-flipdisc-display/
       Loom.md           # the draft
       Loom-cites.json   # 引用的 capture / quote / artifact
       Loom-meta.json    # weight, last-touched, status
   ```
2. weight 字段（active / wintering / archived）
3. UI："eleven journals on a deep shelf"

#### Phase 8 —— 收集层合并 + 本地 importer 主线

1. 把 Codex 的 InteractiveArtifact 树合到主分支
2. quote / tag 系统扩展到能引用 artifact-state
3. 本地文件 importer：PDF.js + Pandoc + Tesseract（OCR fallback）
4. 跑 flipdisc + Moodle 试金石

#### Phase 9 —— 居家体验

1. The Year（12 列 + 一条丝带）
2. Wintering 状态机（capture / 本地文件均自动归档）
3. Discipline.md（六条 refusals 写下来作为 in-app 文档）
4. Atlas surface 升级（origin icon 区分）

#### Phase 10 —— 后续打磨

1. Connections / Correspondents 视觉化
2. Atelier 多 source 平铺
3. The Hour, ticking
4. Working mode（公开版屏蔽私密）

### 不做的事（明确弃案）

- **不做** native iOS / Android app —— Loom 是给桌面读 + 写场景的
- **不做** 协作 / 共享空间 —— Loom 是 single-user 的
- **不做** 公共 Loom 内容市场 / 广场 —— 违反 Refusal #4
- **不做** 集成 Twitter / Slack / 邮件 —— 那些是 flow 不是 hold
- **不做** "用 AI 自动从你的 capture 生成日报" —— AI 不主动，违反 Refusal #3
- **不做** "course / dossier" 新 entity —— 普通 tag 就够（Plate II 已说明）

---

## Plate IX — Specimen（结尾自留）

> **Loom 是给一个特定的人做的。**
>
> 那个人**有真问题在追**（不是"提升效率"），**有阅读习惯**（不是只刷 feed），**写东西是给自己看的**（不是为了发表），**愿意慢**（不是为了产出），**不接受被监视**（拒绝 telemetry），**爱 typesetting 美学**（喜欢 Cormorant 多过 Inter）。
>
> 这个人很可能是个学生、研究者、写作者、设计师、独立思考者 —— 一个**手上有真问题、有大量异质资料（PDF / 网页 / PPT / 笔记）、想用 AI 做真活而不是装样子**的人。
>
> 如果你不是那个人，Loom 不适合你。**没关系。**
>
> 如果你是那个人，Loom 想做你 30 年后还在用的那个东西。**像 emacs，像 BBEdit，像一本你年年回到的笔记本。**
>
> —— flipdisc 教程会被忘记，AI 模型会换代，操作系统会改名，**但你这两年读过、写过、追过的东西不应该消失。**
>
> **Loom 是那个不让它消失的房子。**

---

## Colophon

本文档基于 2026-05-04 至 2026-05-08 的对话整理，四次澄清后定稿：

1. **三能力**（信息收集 / 信息整理 / 思维草稿） · 用户 2026-05-08 澄清
2. **flipdisc 多富态要求** · 用户 2026-05-08 澄清
3. **Cursor for thought 定位** · 类比对齐
4. **本地文件 first-class** · 用户 2026-05-08 澄清（Apple Notes P3、用 tag 不发明 dossier）

### 引用

- `Material Audit.html` · 「The grain of things」
- `Loom - Vellum IX.html` · 「Eight Plates, set in Cormorant & Plex」
- `LOOM Logo Variations.html` · figure-8 woven through the O's 是 Loom 母题
- Cursor (cursor.com) · 「⌘K, Tab, @, Composer」
- 用户原话："Loom的核心能力就三个：信息收集，信息整理，思维草稿"

### 版本历史

- **v1.1** (2026-05-08) · 新增 Plate II 多源 corpus + Refusal #6（本地文件全文不主动上传）
- **v1.0** (2026-05-08 早) · 三能力 + Cursor for thought 定位 + 6 Plates

### 下次修订条件

任何下列变化触发新版本：
- 三能力定义变化
- 任何 Refusal 增删
- 19 个 Surface 列表变化
- 试金石场景变化
- AI provider 默认架构变化

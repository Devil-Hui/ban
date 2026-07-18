---
name: weui-miniprogram-ui
description: WeChat Mini Program UI craft for 排班协同 — WeUI native feel + TDesign enterprise components + product v4 tokens. Use when designing mini program screens, draw.io phone mockups, WXML/WXSS, or reviewing UI for native WeChat consistency.
---

# WeUI / Mini Program UI (排班协同)

## Sources (installed / referenced)

- Official WeUI: native WeChat visual language ([weui-miniprogram](https://github.com/wechat-miniprogram/weui-miniprogram), ~2.4k★)
- TDesign Mini Program: enterprise components ([tdesign-miniprogram](https://github.com/Tencent/tdesign-miniprogram), ~1.7k★)
- Interface design craft: Linear/Vercel density, hierarchy ([interface-design](https://github.com/Dammyjay93/interface-design), ~5.2k★)
- Official plugin: `frontend-design@claude-plugins-official`
- Product tokens: `miniprogram/app.wxss` v4

## Intent for this product

| | |
|--|--|
| **Who** | 发布者 / 加入者，早间扫一眼班次、晚间填空闲 |
| **Job** | 看清今日谁在班、快速创建/加入、完成填表与出表 |
| **Feel** | 冷静像飞书日历，可靠像微信原生，密度像 Linear 工具，**不是**彩虹运营页 |

## Interaction specs (publisher admin flows)

Designing **any 后台/发布者交互页** (buttons, dialogs, drawers, empty/skeleton, testable paths):
**also follow** project skill `publisher-interaction-spec` — force single publisher role + one core task, then output in order: (1) page layout global, (2) shared component fixed tokens, (3) per-button data state machines (disabled / trigger / success / business fail / network) + empty/boundary tables. Template: `docs/templates/publisher-interaction-page-spec.md`.

## Signature (only-this-product)

**班表格子 Duty Grid** — 星期 × 节次/时间段 的可点格子。任何首页/样式预览/填空闲都必须让格子成为视觉主角，而不是通用三列统计卡。

## Tokens (lock)

```
--c-primary:        #2B6DE5
--c-primary-dark:   #1F56C7
--c-primary-light:  #EAF1FF
--c-bg:             #F7F8FA
--c-card:           #FFFFFF
--c-border:         #EEF0F3
--c-text:           #1F2329
--c-text-2:         #646A73
--c-text-3:         #8F959E
--c-success:        #07C160   /* WeChat green for success CTAs */
--c-warning:        #FA9D3B
--c-danger:         #FA5151
--r-card:           12px
--r-btn:            8px
--r-pill:           999px
--space:            4 / 8 / 12 / 16 / 24 / 32
--type:             11 / 12 / 13 / 14 / 16 / 18 / 22
--shadow-card:      0 1px 4px rgba(31,35,41,0.06)   /* whisper only */
```

**60/30/10:** 60% 灰白结构 · 30% 卡片白 · 10% 主蓝（状态色仅语义使用）。

## WeUI / TDesign rules

1. **一屏一主操作** — 一个实心主按钮；次操作用描边或文字按钮。
2. **保留右上角胶囊** — 小程序菜单位不可被内容侵占。
3. **触控 ≥ 44px** 行高；主按钮高 40–44px。
4. **列表 Cell** — 左内容右 chevron；分割线用淡色，不重框。
5. **成功/失败** — 用语义色 + 短文案，不堆 emoji 派对。
6. **Tab ≤ 4** — 首页 / 日程 / 任务 / 我的；选中 = primary，未选 = text-3。
7. **表单** — 标签上、输入下；错误红字在字段下，不挡操作。
8. **原生优先** — 能用 WeUI/TDesign 组件语义就不要发明第三套控件。

## Anti-slop (禁止)

- 彩虹渐变顶栏 + 粉青紫光斑同时出现
- 每个入口一个不同高饱和色圆标
- 大阴影、玻璃拟态、霓虹描边
- 三列等大 metric 盒子当唯一首页结构（须配合班表/任务焦点）
- 装饰性编号 01/02/03（除非真是步骤序列）

## draw.io phone mock rules

- 机身：浅深灰圆角，**无彩色光晕环**
- 屏：`#F7F8FA`，顶栏白底或极浅 primary-light，**非渐变横幅**
- 主按钮：`#2B6DE5` 实心；成功主按钮可用 `#07C160`（微信绿，分享/加入成功）
- 班表格子：选中 primary 填充；有班次用 primary-light；空格白底细边
- 箭头：细正交、深灰，标签短
- 密度：卡片 padding ~12，间距 8/12，圆角 8–12

## Hierarchy checklist

- [ ] 一眼看到焦点（今日班次 / 主 CTA / 班表）
- [ ] 字重层级：600 标题 · 500 标签 · 400 辅助（同字号也可分三级）
- [ ] 颜色只服务状态与主操作
- [ ] 与 `app.wxss` token 一致
- [ ] 空态/错误有下一步，不卖惨

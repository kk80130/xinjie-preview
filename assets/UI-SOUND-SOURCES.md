# UI / You & I 交互音效来源

Sounds by **JDSherbert** — [作者主页](https://jdsherbert.itch.io/)。

使用素材包：**JDSherbert - Ultimate UI SFX Pack (FREE)**，使用其中 `Mono / wav (SD)` 的全部 **14 种片段**。此文件记录第三方音效来源；音效版权归原作者，不将其标记为本项目原创或 CC0。

## 使用依据

2026-10-21 核对的[作者官方 Terms & Conditions](https://jdsherbert.itch.io/terms-and-conditions)允许在免费或商业项目中使用、修改素材及随完成作品发布，并要求署名；禁止将原始或修改后的散装素材再分发、转售，或放入可直接提取的素材包与公共素材仓库。条款明确允许将素材封装为随产品发布的独立二进制文件，例如 soundbank。本项目将处理后的片段封装在单一 `ui-sounds.bank` 中，仅供网站交互播放，不附带源 WAV。

作者条款同时说明，素材包若附有单独许可证，应以该许可证为准；此次已检查本地素材包文件名，未发现单独的许可证或条款文件。后续若更换素材版本，需重新核对其随包许可。

## 选用片段

源文件名的共同前缀为 `JDSherbert - Ultimate UI SFX Pack - `，后缀均为 `.wav`。

| 播放键 | 源文件名主体 | 处理后时长 | 强调时间 | WAV 字节数 | 适用交互 |
| --- | --- | ---: | ---: | ---: | --- |
| `cursor-1` | Cursor - 1 | 285.533 ms | 7.290 ms | 25,228 | 章节导航、明确的页面目标 |
| `cursor-2` | Cursor - 2 | 76.576 ms | 6.723 ms | 6,798 | 滚动中逐项显现的轻量节点 |
| `cursor-3` | Cursor - 3 | 103.741 ms | 11.122 ms | 9,194 | 页签、信息切换 |
| `cursor-4` | Cursor - 4 | 104.240 ms | 8.764 ms | 9,238 | 比较状态、演示滑杆 |
| `cursor-5` | Cursor - 5 | 198.980 ms | 11.621 ms | 17,594 | 关键节点、重播入口 |
| `cancel-1` | Cancel - 1 | 360.454 ms | 9.354 ms | 31,836 | 取消或回到上一层 |
| `cancel-2` | Cancel - 2 | 683.061 ms | 119.218 ms | 60,290 | 拒绝请求等有明确收束的操作 |
| `select-1` | Select - 1 | 373.175 ms | 24.932 ms | 32,958 | 明确确认、开始对局 |
| `select-2` | Select - 2 | 413.129 ms | 6.043 ms | 36,482 | 结算落定、提交成功 |
| `swipe-1` | Swipe - 1 | 485.714 ms | 98.991 ms | 42,884 | 选择并发出词条牌 |
| `swipe-2` | Swipe - 2 | 427.891 ms | 64.955 ms | 37,784 | 回滚或反向收束的动作 |
| `open` | Popup Open - 1 | 302.812 ms | 29.195 ms | 26,752 | 展开详情或进入信息层 |
| `close` | Popup Close - 1 | 382.381 ms | 12.211 ms | 33,770 | 收起内容或关闭信息层 |
| `error` | Error - 1 | 580.249 ms | 128.696 ms | 51,222 | 操作失败、提交失败 |

交互对应由网站播放器确定；此处只说明片段用途，不改变对局规则、时序或游戏数值。

## 处理摘要

由 `tools/build-ui-sounds.mjs` 读取 RIFF/WAVE 数据块；只接收单声道、44,100 Hz、16 位 PCM。

- 以约 −60 dBFS（绝对采样幅度 33）定位有效声音，裁掉首尾冗余静音。
- 有效声音前保留约 4 ms，后保留约 25 ms；若源文件边界不足，则保留到源边界。
- 末尾约 5 ms 线性淡出，最终采样为零，减少截断爆音。
- 仅对超过上限的峰值衰减至至多 −9 dBFS；不放大小声音，不加压缩或混响。
- 生成标准 44 字节 PCM WAV 头，去除无关元数据，再封装 soundbank。
- 在处理后的 PCM 上以 10 ms 窗口逐采样移动，找出均方根（RMS）最高的窗口，将其中心相对片段起点的位置存为 `peakSeconds`；同能量时保留最早窗口。使用声能强调点而不是整个文件中单个最大采样，对齐动效的接触、选中或落定姿势。
- `durationSeconds` 存处理后实际时长；两个时间值以秒表示，保留 6 位小数。片段内的强调点不等于该次交互应等待的固定时长，播放时机由播放器配合动作节奏决定。

本版文件总计 **423,352 字节（约 413.4 KiB）**，其中 manifest 为 1,310 字节；14 个片段均已通过 RIFF、格式、连续区间、峰值及尾部采样检查。时长与强调时间也会从 PCM 重算并与 manifest 比较，容差为一个采样周期。该检查确认文件结构和时间元数据可解析，不等同于浏览器试听或实际设备响度验收。

## Soundbank 格式

`ui-sounds.bank` 使用以下顺序：

1. 前 8 字节：ASCII `UIASFX01`。
2. 后 4 字节：无符号小端整数，表示 manifest 的 UTF-8 字节长度。
3. manifest JSON：`{"version":1,"clips":{"cursor-1":{"offset":0,"length":25228,"peakSeconds":0.00729,"durationSeconds":0.285533},...}}`。
4. 数据区：按表中顺序，依次拼接 14 个带独立 WAV 头的处理后片段。

每个 `offset` 相对**数据区起点**，`length` 包括该片段自身 WAV 头，片段之间没有空隙；`peakSeconds` 与 `durationSeconds` 是该片段自身的时间坐标。容器版本仍为 1。浏览器读取 manifest 后，按范围切片并交给 `AudioContext.decodeAudioData()`；无需加载 14 个散装文件。

## 复现与检查

源素材放在仓库外，不将私人磁盘位置写入脚本。

```powershell
node tools/build-ui-sounds.mjs --source-dir '你的素材目录/Mono/wav (SD)'
```

也可通过 `UI_SOUND_SOURCE_DIR` 环境变量指定同一目录。脚本固定输出到项目的 `assets/ui-sounds.bank`，并报告各片段时长和衰减量。

不需要源素材时，可检查当前音效包：

```powershell
node tools/build-ui-sounds.mjs --check
```

本文件及打包脚本用于记录作品来源与制作过程，不授权将音效从成品中另行提取、分发或转售。

# 信界交互音效来源

2026-11-04：按用户要求改用 **Shapeforms Audio Free Sound Effects**，旧音效包已从当前播放链路移除。

作者主页：https://www.shapeforms.com/

## 来源与使用依据

使用随包的《Shapeforms Audio License Agreement.pdf》：第1页允许商业或非商业完成作品使用及剪辑处理，无需署名；第2页限制独立素材再分发、生成式AI训练与独立音轨Content ID登记，并要求合理保护素材。原素材保留在用户素材目录，项目不附带散装WAV下载入口。来源声明不将素材标为项目原创或CC0。

使用专用容器和片段加扰增加直接分离成本；浏览器播放需要解码，这种包装不是保密加密，不保证素材不可提取。

## 当前选片

|片段键|包内相对来源|处理后秒数|声能强调点（秒）|
|---|---|---:|---:|
|tap-soft|Type Preview/Tablet/Tablet_Tap_07.wav|0.173|0.051|
|key-light|Type Preview/Laptop/Laptop_Keystroke_82.wav|0.246|0.040|
|key-body|Type Preview/Laptop/Laptop_Spacebar_06.wav|0.211|0.013|
|key-dry|Type Preview/PC Keyboard/PC Keyboard_Keystroke_28.wav|0.249|0.008|
|paper-swipe|Type Preview/Tablet/Tablet_Swipe_01.wav|0.335|0.037|
|brush-soft|Type Preview/Laptop/Laptop_Brush Keyboard_12.wav|0.543|0.164|
|ui-press|Future UI Preview/Audio/FUI Holographic Button Press-1.wav|0.607|0.091|
|ui-tap|Future UI Preview/Audio/Holographic Tap Interaction.wav|0.619|0.219|
|ui-step|Future UI Preview/Audio/FUI Navigation Tone Stereo Flutter.wav|0.410|0.071|
|ui-open|Future UI Preview/Audio/Hologram Menu Open-2.wav|0.707|0.123|
|ui-close|Future UI Preview/Audio/Old Terminal Popup Appear Low.wav|0.619|0.098|
|ui-confirm|Future UI Preview/Audio/FUI Button Beep Clean.wav|0.450|0.008|
|ui-notice|Future UI Preview/Audio/FUI Ping Triplet Echo.wav|0.616|0.008|
|ui-error|Future UI Preview/Audio/Error Triplet-5.wav|0.277|0.022|
|ui-radiate|Future UI Preview/Audio/FUI Holographic Interaction Radiate.wav|0.850|0.149|
|message-soft|Arcane Activations Preview/AUDIO/UI Message Appear 01.wav|0.636|0.041|

## 处理与播放

- 保留44.1kHz、16位、双声道及原始声场；裁掉首尾静音，保留约4ms前缘和25ms尾缘。
- 各片只衰减至不高于−12dBFS峰值，不放大弱声；加入2ms入缘、12ms出缘，最终采样归零。
- 放射动作片段最多850ms，确认片段450ms，其余最多800ms；不用长循环音绑定连续滚动。
- 以双声道合并能量的10ms移动RMS最高窗中心确定强调点，播放器按动作落点调度。
- 默认启用，不增加声音开关；资源准备期间或浏览器尚未允许播放的旧操作不会在稍后补响。
- 滚动声音弱于点击，反向和高优先级操作即时撤回旧滚动声；后台暂停。

## 封装与复现

当前容器 `assets/shapeforms-ui.bank`：1,335,601字节、16个片段。文件头为`UIASFX02`、4字节小端索引长度、version 2 JSON索引及独立加扰WAV片段。每段保留来源、时长、声能强调点和加扰种子。旧容器不作回退。

此仓库只发布网页成品。构建器、验证脚本和原始素材保留在本地制作工程，不随静态预览上传。

文件结构、解扰、峰值和播放调度检查不能替代主观听感；实际音量与音色由用户试听确认。

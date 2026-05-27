# Roleplay Chat Box v2.1

修正内容：
- 默认 API Base URL 改为 https://api.deepseek.com
- 默认模型改为 deepseek-v4-flash
- 优先从角色卡内嵌字段检测 world / lorebook / character_book
- 新增“查看卡内扩展”面板

当前行为：
- 如果角色卡内嵌世界书，会自动读取并显示条目数
- 仍允许额外导入外部世界书 JSON，用作覆盖或补充
- 仍是最小实现，不等同于完整 SillyTavern lorebook / preset engine

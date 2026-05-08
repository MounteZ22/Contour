# Contour 内容模板规范

这些文档定义 Contour vault 中各类文件的标准格式。它们不是代码模板（不再使用 Jinja2），而是**内容结构规范**——告诉用户和 coding agent 每种文件应该包含什么字段、什么正文结构。

Contour 的数据层用 Markdown + YAML frontmatter 组织，前端/后端用 TypeScript 直接解析，不需要模板引擎。

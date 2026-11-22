# 桌面端界面

- 使用 React、TSX 和 `@lobehub/ui` 构建界面。新增或修改交互控件时，先查看已安装版本的组件导出、类型和样式入口。使用 StyleX 处理页面布局和项目样式。
- 表单采用 `@lobehub/ui/form` 的 `Form` 和 `Form.Field`。文本、密码、数字、多行文本、选择和日期分别使用 `Input`、`InputPassword`、`InputNumber`、`TextArea`、`Select` 和 `DatePicker`。日期时间使用带 `showTime` 的日期选择器。
- 每个字段提供关联标签和中文 placeholder。变更控件时保留必填校验、可选字段的空值，以及提交给 Electron 主进程的数据格式。
- 修改表单交互后，在 fnm 指定的 Node.js 版本下运行 `npm run build` 和 `npm run test:desktop`，用 TypeScript 桌面测试覆盖实际录入和提交路径。

- Avoid unnecessary secondary labels and descriptions. Let the layout do the explaining. 页面优先用布局和控件表达层级，去掉与当前导航重复的页标题和卡片说明，保留字段标签、校验反馈和无障碍名称。

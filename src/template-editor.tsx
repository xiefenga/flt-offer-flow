import * as stylex from "@stylexjs/stylex";
import StarterKit from "@tiptap/starter-kit";
import { StepMap } from "@tiptap/pm/transform";
import { BubbleMenu } from "@tiptap/react/menus";
import { useEffect, useRef, useState } from "react";
import TextAlign from "@tiptap/extension-text-align";
import { Button } from "@lobehub/ui/es/Button/index";

import "@lobehub/ui/css/DropdownMenu.css";
import { Node, mergeAttributes } from "@tiptap/core";
import DropdownMenu from "@lobehub/ui/es/DropdownMenu/index";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";

import { s } from "./styles";
import { MailImage, MailMedia } from "./mail-media";
import { isWebLink } from "../shared/mail-media.mjs";
import { BlockMenu, type BlockCommand } from "./block-menu";
import {
  templateVariable,
  templateHTML,
  variableCommands,
} from "./template-variable";
const Signature = Node.create({
  name: "signature",
  group: "block",
  content: "inline*",
  parseHTML: () => [{ tag: "footer" }],
  renderHTML: ({ HTMLAttributes }) => [
    "footer",
    mergeAttributes(HTMLAttributes),
    0,
  ],
});
const extensions = (mail: boolean, fields: string[][]) => [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    code: false,
    codeBlock: false,
    link: mail
      ? {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          isAllowedUri: isWebLink,
        }
      : false,
  }),
  ...(mail ? [MailImage] : []),
  Signature,
  templateVariable(new Map(fields.map(([key, label]) => [key, label]))),
  TextStyle,
  Color,
  FontSize,
  TextAlign.configure({ types: ["heading", "paragraph", "signature"] }),
];
type Props = {
  fields: string[][];
  mail?: boolean;
  value?: string;
  onChange?: (html: string) => void;
  onBlur?: () => void;
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
  label: string;
  placeholder: string;
};
const TemplateEditor = ({
  value = "",
  onChange,
  onBlur,
  id,
  label,
  placeholder,
  mail = false,
  fields,
  ...aria
}: Props) => {
  const imageInput = useRef<HTMLInputElement>(null);
  const [dialog, setDialog] = useState<"link" | "image" | null>(null);
  const attributes = {
    id: id ?? "notice-rich-editor",
    role: "textbox",
    "aria-label": label,
    "aria-multiline": "true",
    "aria-placeholder": placeholder,
    "aria-invalid": String(Boolean(aria["aria-invalid"])),
    "aria-describedby": aria["aria-describedby"] ?? "",
    class: stylex.props(s.richContent).className ?? "",
  };
  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: extensions(mail, fields),
      content: value,
      editorProps: { attributes },
      onUpdate: ({ editor }) => onChange?.(templateHTML(editor)),
      onBlur: () => onBlur?.(),
    },
    [fields],
  );
  // Initial markup may normalize on parse. Only reset on an external edit.
  useEffect(() => {
    if (editor && !editor.isDestroyed && value !== templateHTML(editor)) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e && !e.isDestroyed
        ? {
            empty: e.isEmpty,
            cursor: e.state.selection.empty,
            blockIndex: e.state.selection.$from.index(0),
            blockCount: e.state.doc.childCount,
            image: e.isActive("mailImage"),
            link: e.isActive("link"),
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            underline: e.isActive("underline"),
            block: e.isActive("heading")
              ? String(e.getAttributes("heading").level)
              : e.isActive("signature")
                ? "signature"
                : "paragraph",
            undo: e.can().undo(),
            redo: e.can().redo(),
          }
        : null,
  });
  if (!editor || !active) {
    return null;
  }
  const cmd = () => editor.chain().focus();
  const blocks = [
    ["paragraph", "正文"],
    ["1", "主标题"],
    ["2", "二级标题"],
    ["3", "三级标题"],
    ["signature", "落款"],
  ];
  const blockItems = blocks.map(([key, label]) => ({
    key,
    label,
    onClick: () => {
      if (key === "paragraph") {
        cmd().setParagraph().run();
      } else if (key === "signature") {
        cmd().setNode("signature").run();
      } else {
        cmd()
          .setHeading({ level: Number(key) as 1 | 2 | 3 })
          .run();
      }
    },
  }));
  const moveBlock = (direction: -1 | 1) => {
    const { doc, selection, tr } = editor.state;
    const index = selection.$from.index(0);
    if (
      index + direction < 0 ||
      index + direction >= doc.childCount ||
      !selection.empty
    ) {
      return;
    }
    const current = doc.child(index),
      neighbor = doc.child(index + direction);
    const start =
      selection.$from.before(1) - (direction === -1 ? neighbor.nodeSize : 0);
    tr.replaceWith(
      start,
      start + current.nodeSize + neighbor.nodeSize,
      direction === -1 ? [current, neighbor] : [neighbor, current],
    );
    tr.setSelection(
      selection.map(tr.doc, StepMap.offset(direction * neighbor.nodeSize)),
    );
    editor.view.dispatch(tr.scrollIntoView());
    editor.commands.focus();
  };
  const commands: BlockCommand[] = [
    ...blockItems.map((item) => ({
      id: item.key,
      label: item.label,
      group: "内容块",
      run: item.onClick,
    })),
    {
      id: "bullet",
      label: "项目符号",
      group: "内容块",
      run: () => cmd().toggleBulletList().run(),
    },
    {
      id: "ordered",
      label: "编号列表",
      group: "内容块",
      run: () => cmd().toggleOrderedList().run(),
    },
    {
      id: "quote",
      label: "引用",
      group: "内容块",
      run: () => cmd().toggleBlockquote().run(),
    },
    ...(active.cursor && active.blockIndex > 0
      ? [
          {
            id: "move-up",
            label: "上移内容块",
            group: "块操作",
            run: () => moveBlock(-1),
          },
        ]
      : []),
    ...(active.cursor && active.blockIndex + 1 < active.blockCount
      ? [
          {
            id: "move-down",
            label: "下移内容块",
            group: "块操作",
            run: () => moveBlock(1),
          },
        ]
      : []),
    ...(mail
      ? [
          {
            id: "image",
            label: "插入图片",
            group: "邮件",
            run: () => imageInput.current?.click(),
          },
          {
            id: "link",
            label: "设置链接",
            group: "邮件",
            run: () => setDialog("link"),
          },
        ]
      : []),
    ...variableCommands(editor, fields),
    {
      id: "slash",
      label: "斜杠 /",
      group: "符号",
      run: () => cmd().insertContent("/").run(),
    },
  ];
  const mark = (
    label: string,
    glyph: React.ReactNode,
    pressed: boolean,
    apply: () => void,
  ) => (
    <Button
      size="small"
      type="text"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      {...stylex.props(s.inlineButton, pressed && s.inlineActive)}
      onMouseDown={(event) => event.preventDefault()}
      onClick={apply}
    >
      {glyph}
    </Button>
  );
  return (
    <div {...stylex.props(s.editorBox)}>
      <BubbleMenu
        editor={editor}
        updateDelay={60}
        options={{
          placement: "top",
          strategy: "absolute",
          offset: 8,
          flip: true,
          shift: { padding: 8 },
          hide: true,
          scrollTarget: editor.view.dom,
        }}
        role="toolbar"
        aria-label="选中文本格式"
        {...stylex.props(s.inlineToolbar)}
      >
        {mark("加粗", <b>B</b>, active.bold, () => cmd().toggleBold().run())}
        {mark("斜体", <i>I</i>, active.italic, () =>
          cmd().toggleItalic().run(),
        )}
        {mark("下划线", <u>U</u>, active.underline, () =>
          cmd().toggleUnderline().run(),
        )}
        <span aria-hidden="true" {...stylex.props(s.inlineDivider)} />
        <DropdownMenu items={blockItems} popupProps={{ finalFocus: false }}>
          <Button
            type="text"
            size="small"
            aria-label="段落样式"
            {...stylex.props(s.inlineButton)}
          >
            {blocks.find(([key]) => key === active.block)?.[1]} ▾
          </Button>
        </DropdownMenu>
        {mail &&
          (active.image ? (
            <Button
              size="small"
              type="text"
              {...stylex.props(s.inlineButton)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setDialog("image")}
            >
              图片样式
            </Button>
          ) : (
            <Button
              size="small"
              type="text"
              {...stylex.props(s.inlineButton)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setDialog("link")}
            >
              设置链接
            </Button>
          ))}
        {active.link && (
          <Button
            size="small"
            type="text"
            {...stylex.props(s.inlineButton)}
            onClick={() => cmd().extendMarkRange("link").unsetLink().run()}
          >
            移除链接
          </Button>
        )}
        <DropdownMenu
          popupProps={{ finalFocus: false }}
          items={[
            { key: "block", label: "段落样式", children: blockItems },
            {
              key: "size",
              label: "文字字号",
              children: [9, 10, 11, 12, 14, 16, 18, 24, 32].map((n) => ({
                key: n,
                label: n + " pt",
                onClick: () =>
                  cmd()
                    .setFontSize(n + "pt")
                    .run(),
              })),
            },
            {
              key: "color",
              label: "文字颜色",
              children: [
                ["黑色", "#111111"],
                ["深绿", "#285b48"],
                ["蓝色", "#24589c"],
                ["红色", "#aa3030"],
              ].map(([label, color]) => ({
                key: color,
                label,
                onClick: () => cmd().setColor(color).run(),
              })),
            },
            {
              key: "align",
              label: "段落对齐",
              children: [
                ["left", "左对齐"],
                ["center", "居中"],
                ["right", "右对齐"],
                ["justify", "两端对齐"],
              ].map(([key, label]) => ({
                key,
                label,
                onClick: () => cmd().setTextAlign(key).run(),
              })),
            },
            {
              key: "bullet",
              label: "项目符号",
              onClick: () => cmd().toggleBulletList().run(),
            },
            {
              key: "ordered",
              label: "编号",
              onClick: () => cmd().toggleOrderedList().run(),
            },
            {
              key: "undo",
              label: "撤销",
              disabled: !active.undo,
              onClick: () => cmd().undo().run(),
            },
            {
              key: "redo",
              label: "重做",
              disabled: !active.redo,
              onClick: () => cmd().redo().run(),
            },
          ]}
        >
          <Button type="text" size="small" {...stylex.props(s.inlineButton)}>
            更多格式
          </Button>
        </DropdownMenu>
      </BubbleMenu>
      <div {...stylex.props(s.writingArea)}>
        {active.empty && (
          <span aria-hidden {...stylex.props(s.writingHint)}>
            {placeholder}，输入 / 查看命令
          </span>
        )}
        <EditorContent editor={editor} />
        <BlockMenu editor={editor} commands={commands} />
      </div>
      {mail && (
        <MailMedia
          editor={editor}
          input={imageInput}
          dialog={dialog}
          close={() => setDialog(null)}
        />
      )}
    </div>
  );
};
export default TemplateEditor;

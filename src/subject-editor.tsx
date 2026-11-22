import { useEffect } from "react";
import * as stylex from "@stylexjs/stylex";
import { Node, Extension } from "@tiptap/core";
import { history, undo, redo } from "@tiptap/pm/history";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";

import { s } from "./styles";
import { BlockMenu } from "./block-menu";
import { templateVariable, variableCommands } from "./template-variable";

const documentNode = Node.create({
  name: "doc",
  topNode: true,
  content: "inline*",
});
const textNode = Node.create({ name: "text", group: "inline" });
const editingHistory = Extension.create({
  name: "subjectHistory",
  addProseMirrorPlugins: () => [history()],
  addKeyboardShortcuts() {
    return {
      "Mod-z": () => undo(this.editor.state, this.editor.view.dispatch),
      "Mod-Shift-z": () => redo(this.editor.state, this.editor.view.dispatch),
      "Mod-y": () => redo(this.editor.state, this.editor.view.dispatch),
    };
  },
});
const content = (value: string) => ({
  type: "doc",
  content: value ? [{ type: "text", text: value }] : [],
});
type Props = {
  fields: string[][];
  value?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};
const SubjectEditor = ({
  fields,
  value = "",
  onChange,
  onBlur,
  id,
  ...aria
}: Props) => {
  const placeholder = "输入主题，或用 / 插入变量";
  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        documentNode,
        textNode,
        editingHistory,
        templateVariable(new Map(fields.map(([key, label]) => [key, label]))),
      ],
      content: content(value),
      editorProps: {
        attributes: {
          id: id ?? "mail-subject",
          role: "textbox",
          "aria-label": "邮件主题",
          "aria-placeholder": placeholder,
          "aria-multiline": "false",
          "aria-invalid": String(Boolean(aria["aria-invalid"])),
          "aria-describedby": aria["aria-describedby"] ?? "",
          class: stylex.props(s.subjectContent).className ?? "",
        },
        handleKeyDown: (_, event) =>
          event.key === "Enter" && !event.isComposing,
        handlePaste: (view, event) => {
          const text = event.clipboardData?.getData("text/plain");
          if (text === undefined) {
            return false;
          }
          view.dispatch(
            view.state.tr.insertText(text.replace(/[\r\n]+/g, " ")),
          );
          return true;
        },
      },
      onUpdate: ({ editor }) => onChange?.(editor.getText()),
      onBlur: () => onBlur?.(),
    },
    [fields],
  );
  useEffect(() => {
    if (editor && !editor.isDestroyed && editor.getText() !== value) {
      editor.commands.setContent(content(value), { emitUpdate: false });
    }
  }, [editor, value]);
  const empty = useEditorState({
    editor,
    selector: ({ editor: e }) => e?.isEmpty,
  });
  if (!editor) {
    return null;
  }
  return (
    <div {...stylex.props(s.editorBox, s.writingArea)}>
      {empty && (
        <span aria-hidden {...stylex.props(s.writingHint, s.subjectHint)}>
          {placeholder}
        </span>
      )}
      <EditorContent editor={editor} />
      <BlockMenu
        editor={editor}
        commands={variableCommands(editor, fields)}
        label="插入主题变量"
      />
    </div>
  );
};
export default SubjectEditor;

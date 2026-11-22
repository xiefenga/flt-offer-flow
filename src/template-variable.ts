import { Plugin } from "@tiptap/pm/state";
import * as stylex from "@stylexjs/stylex";
import { Node, type Editor } from "@tiptap/core";

import { s } from "./styles";
import { variablePattern } from "../shared/validation.mjs";

export const templateVariable = (labels: Map<string, string>) =>
  Node.create({
    name: "templateVariable",
    group: "inline",
    inline: true,
    atom: true,
    addAttributes: () => ({ key: { default: "" } }),
    renderText: ({ node }) => "{{" + node.attrs.key + "}}",
    renderHTML: ({ node }) => [
      "span",
      { "data-template-variable": "" },
      "{{" + node.attrs.key + "}}",
    ],
    addNodeView:
      () =>
      ({ node }) => {
        const dom = document.createElement("span");
        dom.className = stylex.props(s.variableChip).className ?? "";
        dom.contentEditable = "false";
        dom.textContent = labels.get(node.attrs.key) ?? node.attrs.key;
        dom.title = "模板变量 · " + dom.textContent;
        return { dom };
      },
    onCreate() {
      this.editor.view.dispatch(
        this.editor.state.tr
          .setMeta("loadVariables", true)
          .setMeta("addToHistory", false),
      );
    },
    addProseMirrorPlugins() {
      const type = this.type;
      return [
        new Plugin({
          appendTransaction(transactions, _old, state) {
            if (
              !transactions.some(
                (tr) => tr.docChanged || tr.getMeta("loadVariables"),
              )
            ) {
              return;
            }
            const tr = state.tr;
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text?.includes("{{")) {
                return;
              }
              for (const match of node.text.matchAll(variablePattern)) {
                const key = match[1];
                if (!labels.has(key)) {
                  continue;
                }
                const start = tr.mapping.map(pos + match.index);
                tr.replaceWith(
                  start,
                  start + match[0].length,
                  type.create({ key }, null, node.marks),
                );
              }
            });
            return tr.docChanged ? tr : null;
          },
        }),
      ];
    },
  });

// The chip belongs to the editor. Persist just the placeholder inside its original formatting.
export function templateHTML(editor: Editor) {
  return editor
    .getHTML()
    .replace(/<span data-template-variable="">({{\w+}})<\/span>/g, "$1");
}

export function variableCommands(editor: Editor, fields: string[][]) {
  return fields.map(([key, label]) => ({
    id: key,
    label,
    group: "变量",
    run: () =>
      editor
        .chain()
        .focus()
        .insertContent({ type: "templateVariable", attrs: { key } })
        .run(),
  }));
}

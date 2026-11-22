import { Node, type Editor } from "@tiptap/core";
import { Form, useForm } from "@lobehub/ui/form";
import { toast } from "@lobehub/ui/es/Toast/index";
import { Modal } from "@lobehub/ui/es/Modal/index";
import { InputNumber, Input } from "@lobehub/ui/es/Input/index";

import Select from "./select";
import {
  imagePresentation,
  isMailImage,
  isWebLink,
  maxImageBytes,
  maxMailHtml,
} from "../shared/mail-media.mjs";

import type { RefObject } from "react";

export const MailImage = Node.create({
  name: "mailImage",
  inline: true,
  group: "inline",
  atom: true,
  addAttributes: () => ({
    src: { default: "" },
    alt: { default: "图片" },
    width: { default: 240 },
    "data-align": { default: "inline" },
    "data-radius": { default: "0" },
  }),
  parseHTML: () => [
    {
      tag: "img[src]",
      getAttrs: (el) => (isMailImage(el.getAttribute("src")) ? {} : false),
    },
  ],
  renderHTML: ({ HTMLAttributes }) => [
    "img",
    {
      ...HTMLAttributes,
      ...imagePresentation(
        HTMLAttributes.width,
        HTMLAttributes["data-align"],
        HTMLAttributes["data-radius"],
      ),
    },
  ],
});

const LinkDialog = ({
  editor,
  close,
}: {
  editor: Editor;
  close: () => void;
}) => {
  const form = useForm({
    initialValues: { url: String(editor.getAttributes("link").href ?? "") },
    onSubmit: ({ url }) => {
      const href = url.trim();
      const chain = editor.chain().focus().extendMarkRange("link");
      if (editor.state.selection.empty && !editor.isActive("link")) {
        chain
          .insertContent({
            type: "text",
            text: href,
            marks: [{ type: "link", attrs: { href } }],
          })
          .run();
      } else {
        chain.setLink({ href }).run();
      }
      close();
    },
  });
  return (
    <Modal
      open
      title="设置链接"
      onCancel={close}
      cancelText="取消"
      okText="应用"
      onOk={() => void form.submit()}
    >
      <Form form={form} layout="vertical">
        <Form.Field
          name="url"
          label="网址"
          required="请输入网址"
          validate={(v) =>
            isWebLink(v.trim())
              ? undefined
              : "请输入以 http:// 或 https:// 开头的完整网址"
          }
        >
          <Input placeholder="https://www.example.com" />
        </Form.Field>
      </Form>
    </Modal>
  );
};

const ImageDialog = ({
  editor,
  close,
}: {
  editor: Editor;
  close: () => void;
}) => {
  const attrs = editor.getAttributes("mailImage");
  const form = useForm({
    initialValues: {
      width: Number(attrs.width),
      radius: Number(attrs["data-radius"]),
      align: String(attrs["data-align"]),
      alt: String(attrs.alt),
    },
    onSubmit: ({ width, radius, align, alt }) => {
      editor
        .chain()
        .focus()
        .updateAttributes("mailImage", {
          width,
          "data-radius": radius,
          "data-align": align,
          alt,
        })
        .run();
      close();
    },
  });
  return (
    <Modal
      open
      title="图片样式"
      cancelText="取消"
      okText="应用"
      onCancel={close}
      onOk={() => void form.submit()}
    >
      <Form form={form} layout="vertical">
        <Form.Field
          name="width"
          label="宽度（px）"
          validate={(v) =>
            Number.isInteger(v) && v >= 1 && v <= 1600
              ? undefined
              : "请输入 1 至 1600 的整数"
          }
        >
          <InputNumber min={1} max={1600} placeholder="1–1600" />
        </Form.Field>
        <Form.Field name="align" label="图片对齐">
          <Select
            placeholder="选择图片对齐方式"
            options={[
              { value: "inline", label: "随文字排列" },
              { value: "left", label: "左对齐" },
              { value: "center", label: "居中" },
              { value: "right", label: "右对齐" },
            ]}
          />
        </Form.Field>
        <Form.Field
          name="radius"
          label="圆角（px）"
          validate={(v) =>
            Number.isInteger(v) && v >= 0 && v <= 100
              ? undefined
              : "请输入 0 至 100 的整数"
          }
        >
          <InputNumber min={0} max={100} placeholder="0–100" />
        </Form.Field>
        <Form.Field name="alt" label="替代文字">
          <Input placeholder="图片说明" maxLength={120} />
        </Form.Field>
      </Form>
    </Modal>
  );
};

export const MailMedia = ({
  editor,
  input,
  dialog,
  close,
}: {
  editor: Editor;
  input: RefObject<HTMLInputElement | null>;
  dialog: "link" | "image" | null;
  close: () => void;
}) => {
  async function insertImage(file: File) {
    try {
      if (file.size > maxImageBytes) {
        throw Error("单张图片最大为 2 MB");
      }
      const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(Error("无法读取图片"));
        reader.readAsDataURL(file);
      });
      if (!isMailImage(src)) {
        throw Error("请选择 PNG、JPEG 或 GIF 图片");
      }
      if (editor.isDestroyed) {
        return;
      }
      if (editor.getHTML().length + src.length + 256 > maxMailHtml) {
        throw Error("邮件模板图片总量过大，请使用较小的图片");
      }
      const image = new Image();
      image.src = src;
      await image.decode();
      if (!editor.isDestroyed) {
        editor
          .chain()
          .focus()
          .insertContent({
            type: "mailImage",
            attrs: {
              src,
              alt: file.name,
              width: Math.min(320, image.naturalWidth),
            },
          })
          .run();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "图片插入失败");
    }
  }
  return (
    <>
      <input
        hidden
        ref={input}
        type="file"
        aria-label="选择正文图片"
        accept="image/png,image/jpeg,image/gif"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file) {
            void insertImage(file);
          }
        }}
      />
      {dialog === "image" && <ImageDialog editor={editor} close={close} />}
      {dialog === "link" && <LinkDialog editor={editor} close={close} />}
    </>
  );
};

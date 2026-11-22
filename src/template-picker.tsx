import * as stylex from "@stylexjs/stylex";
import { Form, useForm } from "@lobehub/ui/form";
import { toast } from "@lobehub/ui/es/Toast/index";
import { Input } from "@lobehub/ui/es/Input/index";
import { Modal } from "@lobehub/ui/es/Modal/index";
import { Button } from "@lobehub/ui/es/Button/index";
import { useState, useId, type ReactNode } from "react";

import { s } from "./styles";
import Select from "./select";

type Option = { value: string; label: string };
const NameDialog = ({
  copy,
  name,
  options,
  save,
  close,
}: {
  copy: boolean;
  name: string;
  options: Option[];
  save: (name: string) => Promise<void>;
  close: () => void;
}) => {
  const [busy, setBusy] = useState(false);
  const form = useForm({
    initialValues: { name: copy ? "" : name },
    onSubmit: async (values) => {
      if (busy) {
        return;
      }
      setBusy(true);
      try {
        await save(values.name.trim());
        close();
      } catch (e) {
        toast.error(String(e).split("Error: ").pop() || "保存失败");
      } finally {
        setBusy(false);
      }
    },
  });
  return (
    <Modal
      open
      title={copy ? "另存为新模板" : "重命名模板"}
      cancelText="取消"
      okText="保存"
      confirmLoading={busy}
      onCancel={() => {
        if (!busy) {
          close();
        }
      }}
      onOk={() => void form.submit()}
    >
      <Form form={form} layout="vertical">
        <Form.Field
          name="name"
          label="模板名称"
          required="请输入模板名称"
          validate={(v) =>
            !v.trim()
              ? "请输入模板名称"
              : options.some((o) => o.label === v.trim()) &&
                  (copy || v.trim() !== name)
                ? "同类模板名称已存在"
                : undefined
          }
        >
          <Input placeholder="例如：校招录用通知" maxLength={60} />
        </Form.Field>
      </Form>
    </Modal>
  );
};
export const TemplatePicker = ({
  id,
  label,
  options,
  busy,
  select,
  save,
  preview,
}: {
  id: string;
  label: string;
  options: Option[];
  busy: boolean;
  preview?: ReactNode;
  select: (id: string) => void;
  save: (name: string, copy: boolean) => Promise<void>;
}) => {
  const selectId = useId();
  const [mode, setMode] = useState<"copy" | "rename" | null>(null);
  return (
    <div
      role="group"
      aria-label={label + "操作"}
      {...stylex.props(s.templatePicker, s.templateToolbar)}
    >
      <label htmlFor={selectId} {...stylex.props(s.visuallyHidden)}>
        选择{label}
      </label>
      <div {...stylex.props(s.templateSelect)}>
        <Select
          id={selectId}
          placeholder={"选择" + label}
          disabled={busy}
          value={id}
          options={options}
          onChange={(v) => {
            if (typeof v === "string") {
              select(v);
            }
          }}
        />
      </div>
      <div {...stylex.props(s.templateActions)}>
        {preview}
        <Button type="text" disabled={busy} onClick={() => setMode("rename")}>
          重命名
        </Button>
        <Button type="text" disabled={busy} onClick={() => setMode("copy")}>
          另存为
        </Button>
        <Button htmlType="submit" type="primary" disabled={busy}>
          保存
        </Button>
      </div>
      {mode && (
        <NameDialog
          copy={mode === "copy"}
          name={options.find((o) => o.value === id)?.label ?? ""}
          options={options}
          close={() => setMode(null)}
          save={(name) => save(name, mode === "copy")}
        />
      )}
    </div>
  );
};

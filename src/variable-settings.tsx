import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import Table from "@lobehub/ui/es/Table/index";
import { Form, useForm } from "@lobehub/ui/form";
import { toast } from "@lobehub/ui/es/Toast/index";
import { Input } from "@lobehub/ui/es/Input/index";
import { Modal } from "@lobehub/ui/es/Modal/index";
import { Button } from "@lobehub/ui/es/Button/index";

import { s } from "./styles";
import { templateFields } from "../shared/validation.mjs";

import type { CustomVariable } from "./api";

type Change = (key: string | null, label: string | null) => Promise<void>;
const VariableDialog = ({
  variable,
  close,
  save,
}: {
  variable: CustomVariable | null;
  close: () => void;
  save: Change;
}) => {
  const [busy, setBusy] = useState(false);
  const form = useForm({
    initialValues: { label: variable?.label ?? "" },
    onSubmit: async ({ label }) => {
      if (busy) {
        return;
      }
      setBusy(true);
      try {
        await save(variable?.key ?? null, label);
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
      title={variable ? "编辑变量" : "新增变量"}
      okText="保存"
      cancelText="取消"
      confirmLoading={busy}
      onOk={() => void form.submit()}
      onCancel={() => {
        if (!busy) {
          close();
        }
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Field
          name="label"
          label="变量名称"
          required="请输入变量名称"
          validate={(v) => (!v.trim() ? "请输入变量名称" : undefined)}
        >
          <Input maxLength={40} placeholder="例如：直属上级" />
        </Form.Field>
      </Form>
    </Modal>
  );
};
export const VariableSettings = ({
  variables,
  onChange,
}: {
  variables: CustomVariable[];
  onChange: (v: CustomVariable[]) => void;
}) => {
  const [editing, setEditing] = useState<CustomVariable | null | undefined>();
  const [removing, setRemoving] = useState<CustomVariable | null>(null);
  const save: Change = async (key, label) =>
    onChange(await window.offerFlow.updateVariable(key, label));
  const rows = [
    ...variables.map((v) => ({ ...v, custom: true })),
    ...templateFields.map(([key, label]) => ({ key, label, custom: false })),
  ];
  return (
    <>
      <div {...stylex.props(s.templatePicker)}>
        <Button type="primary" onClick={() => setEditing(null)}>
          新增变量
        </Button>
      </div>
      <Table
        rowKey="key"
        dataSource={rows}
        pagination={false}
        columns={[
          { title: "变量名称", dataIndex: "label" },
          { title: "来源", render: (_, v) => (v.custom ? "自定义" : "预置") },
          {
            title: "操作",
            align: "center",
            render: (_, v) =>
              v.custom ? (
                <div {...stylex.props(s.tableActions)}>
                  <Button type="link" onClick={() => setEditing(v)}>
                    编辑
                  </Button>
                  <Button
                    type="link"
                    danger
                    onClick={() => {
                      setRemoving(v);
                    }}
                  >
                    删除
                  </Button>
                </div>
              ) : null,
          },
        ]}
      />
      {editing !== undefined && (
        <VariableDialog
          variable={editing}
          close={() => setEditing(undefined)}
          save={save}
        />
      )}
      {removing && (
        <Modal
          open
          title={"删除变量「" + removing.label + "」？"}
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onCancel={() => setRemoving(null)}
          onOk={async () => {
            try {
              await save(removing.key, null);
              setRemoving(null);
            } catch (e) {
              toast.error(String(e).split("Error: ").pop() || "删除失败");
            }
          }}
        ></Modal>
      )}
    </>
  );
};

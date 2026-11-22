import { useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { Form, useForm } from "@lobehub/ui/form";
import { toast } from "@lobehub/ui/es/Toast/index";
import { Modal } from "@lobehub/ui/es/Modal/index";
import { Button } from "@lobehub/ui/es/Button/index";
import { Input, TextArea } from "@lobehub/ui/es/Input/index";

import { s } from "./styles";

import type { Catalog, Company } from "./api";

type Draft = {
  name: string;
  address: string;
  invoiceInfo: string;
  banks: string;
};
const blank: Draft = { name: "", address: "", invoiceInfo: "", banks: "" };
const split = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const CatalogForm = ({
  kind,
  initial,
  onSave,
  cancel,
  busy,
}: {
  kind: keyof Catalog;
  initial: Draft;
  onSave: (draft: Draft) => Promise<void>;
  cancel: () => void;
  busy: boolean;
}) => {
  const form = useForm<Draft>({ initialValues: initial, onSubmit: onSave });
  const label = kind === "companies" ? "公司名称" : "部门名称";
  return (
    <Form form={form} layout="vertical">
      <Form.Field
        label={label}
        name="name"
        required={"请填写" + label}
        validate={(v) => (!v.trim() ? "请填写" + label : undefined)}
      >
        <Input placeholder={"请输入" + label} />
      </Form.Field>
      {kind === "companies" &&
        (
          [
            ["address", "报到地址", "请输入报到地址"],
            [
              "invoiceInfo",
              "开票信息",
              "填写开票主体、税号、开户行和账号等信息",
            ],
            ["banks", "限定银行", "每行一家银行，可注明工资或报销用途"],
          ] as const
        ).map(([key, label, hint]) => (
          <Form.Field
            key={key}
            name={key}
            label={label}
            required={"请填写" + label}
            validate={(v) => (!v.trim() ? "请填写" + label : undefined)}
          >
            {key === "address" ? (
              <Input maxLength={200} placeholder={hint} />
            ) : (
              <TextArea rows={3} resize placeholder={hint} />
            )}
          </Form.Field>
        ))}
      <div {...stylex.props(s.row)}>
        <Button disabled={busy} onClick={cancel}>
          取消
        </Button>
        <Button type="primary" htmlType="submit" loading={busy}>
          保存{kind === "companies" ? "公司" : "部门"}
        </Button>
      </div>
    </Form>
  );
};
export const CatalogSettings = ({
  catalog,
  kind,
  onChange,
}: {
  catalog: Catalog;
  kind: keyof Catalog;
  onChange: (next: Catalog) => void;
}) => {
  const [editor, setEditor] = useState<{
    original: string | null;
    initial: Draft;
  } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isCompany = kind === "companies",
    label = isCompany ? "公司" : "部门";
  async function save(original: string | null, input: Company | string | null) {
    setBusy(true);
    try {
      onChange(await window.offerFlow.updateCatalog(kind, original, input));
      setEditor(null);
      setDeleting(null);
      toast.success(label + "已更新");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section {...stylex.props(s.card)}>
      {!editor && (
        <div {...stylex.props(s.catalogActions)}>
          <Button
            type="primary"
            onClick={() => {
              setEditor({ original: null, initial: blank });
            }}
          >
            新增{isCompany ? "公司" : "部门"}
          </Button>
        </div>
      )}
      {editor ? (
        <CatalogForm
          key={editor.original ?? ""}
          kind={kind}
          initial={editor.initial}
          busy={busy}
          cancel={() => setEditor(null)}
          onSave={(v) =>
            save(
              editor.original,
              isCompany
                ? {
                    name: v.name,
                    address: v.address,
                    banks: split(v.banks),
                    invoiceInfo: v.invoiceInfo,
                  }
                : v.name,
            )
          }
        />
      ) : catalog[kind].length === 0 ? (
        <p>暂无{label}</p>
      ) : (
        catalog[kind].map((item) => {
          const company = typeof item === "string" ? null : item;
          const name = typeof item === "string" ? item : item.name;
          return (
            <article key={name} {...stylex.props(s.catalogRow)}>
              <div>
                <strong>{name}</strong>
                {company && (
                  <>
                    <p>报到地址　{company.address}</p>
                    <p {...stylex.props(s.text)}>
                      开票信息　{company.invoiceInfo}
                    </p>
                    <p>限定银行　{company.banks.join("、")}</p>
                  </>
                )}
              </div>
              <div {...stylex.props(s.row)}>
                <Button
                  size="small"
                  onClick={() => {
                    setEditor({
                      original: name,
                      initial: {
                        name,
                        address: company?.address ?? "",
                        invoiceInfo: company?.invoiceInfo ?? "",
                        banks: company?.banks.join("\n") ?? "",
                      },
                    });
                  }}
                >
                  编辑
                </Button>
                <Button size="small" danger onClick={() => setDeleting(name)}>
                  删除
                </Button>
              </div>
            </article>
          );
        })
      )}
      <Modal
        open={deleting !== null}
        title={"删除" + label + "？"}
        cancelText="取消"
        okText="确认删除"
        confirmLoading={busy}
        onCancel={() => setDeleting(null)}
        onOk={() => {
          if (deleting) {
            void save(deleting, null);
          }
        }}
      >
        <p>删除「{deleting}」后，新 Offer 无法选择该项。</p>
      </Modal>
    </section>
  );
};

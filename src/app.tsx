import * as stylex from "@stylexjs/stylex";
import Tag from "@lobehub/ui/es/Tag/index";
import Table from "@lobehub/ui/es/Table/index";
import { toast } from "@lobehub/ui/es/Toast/index";
import Divider from "@lobehub/ui/es/Divider/index";

import "@lobehub/ui/css/DropdownMenu.css";
import { Modal } from "@lobehub/ui/es/Modal/index";

import "@lobehub/ui/css/Tabs.css";
import "@lobehub/ui/css/ActionIcon.css";
import Popover from "@lobehub/ui/es/Popover/index";
import { Button } from "@lobehub/ui/es/Button/index";
import { Drawer } from "@lobehub/ui/es/Drawer/index";
import ActionIcon from "@lobehub/ui/es/ActionIcon/index";
import DropdownMenu from "@lobehub/ui/es/DropdownMenu/index";
import { ScrollArea } from "@lobehub/ui/es/ScrollArea/index";
import { Form, useForm, useFormInstance } from "@lobehub/ui/form";
import React, { useEffect, useLayoutEffect, useState } from "react";
import { Input, InputNumber, InputPassword } from "@lobehub/ui/es/Input/index";
import {
  DatePicker,
  datePickerLocaleZhCN,
} from "@lobehub/ui/es/DatePicker/index";

import "@lobehub/ui/css/Drawer.css";
import "@lobehub/ui/css/Divider.css";
import {
  TabsRoot,
  TabsList,
  TabsTab,
  TabsPanel,
} from "@lobehub/ui/es/Tabs/index";

import "@lobehub/ui/css/Modal.css";
import "@lobehub/ui/css/Popover.css";
import {
  House,
  History,
  Paperclip,
  Mail as MailIcon,
  FileText,
  Braces,
  Building2,
  Users,
  Settings2,
  Server,
  X,
} from "lucide-react";

import { s } from "./styles";
import "@lobehub/ui/css/Table.css";
import Select from "./select";
import { CcInput } from "./cc-input";
import { MailPreview } from "./mail-preview";
import fields from "../templates/fields.json";
import { TemplateSplit } from "./template-split";
import "@lobehub/ui/css/ScrollArea.css";
import "@lobehub/ui/css/FormKit.css";
import "@lobehub/ui/css/DatePicker.css";
import "@lobehub/ui/theme.css";
import "@lobehub/ui/css/Input.css";
import "@lobehub/ui/css/Select.css";
import "@lobehub/ui/css/Tag.css";
import "@lobehub/ui/css/Button.css";
import { TemplatePicker } from "./template-picker";
import { CatalogSettings } from "./catalog-settings";
import { VariableSettings } from "./variable-settings";
import layoutFields from "../templates/pdf-layout.json";
import { formatDateTime } from "../shared/date-time.mjs";
import { emptyFilter, filterHistory } from "./history-filter";
import {
  emailOK,
  parseCc,
  offerFieldError,
  templateError,
  templateFields,
} from "../shared/validation.mjs";

import type {
  Catalog,
  State,
  Settings,
  Mail,
  Notice,
  RecordDetail,
  Log,
} from "./api";

const SubjectEditor = React.lazy(() => import("./subject-editor"));
const TemplateEditor = React.lazy(() => import("./template-editor"));
const LiveNotice = React.lazy(() => import("./live-notice"));
const api = window.offerFlow;
const titleBarHeight = api.platform === "darwin" ? 38 : 46;
const p = stylex.props;
const tabIcons = {
  首页: House,
  邮件模板: MailIcon,
  附件模板: FileText,
  变量管理: Braces,
  公司设置: Building2,
  部门设置: Users,
  邮箱设置: Server,
};
const settingsPages = [
  "邮件模板",
  "附件模板",
  "变量管理",
  "公司设置",
  "部门设置",
  "邮箱设置",
] as const;
type Tab = keyof typeof tabIcons;
type HistoryDrawer =
  | "新增 Offer"
  | "编辑 Offer"
  | "记录详情"
  | "更新邮件和 PDF";
const groups = [
  ["候选人与岗位", 0, 5],
  ["试用期薪资（元）", 5, 9],
  ["转正薪资（元）", 9, 13],
  ["合同与报到", 13, 18],
] as const;
function richTextError(
  html: string,
  label: string,
  custom: State["customVariables"],
) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  if (
    !parsed.body.textContent?.trim() &&
    !(label === "邮件正文" && parsed.body.querySelector("img[src]"))
  ) {
    return "请填写" + label;
  }
  const walker = parsed.createTreeWalker(parsed.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const error = templateError(
      walker.currentNode.textContent ?? "",
      false,
      true,
      custom,
    );
    if (error) {
      return error;
    }
  }
}
function initialValues() {
  const today = new Date();
  return Object.fromEntries(
    fields.map(([key, , , value]) => [
      key,
      key === "issued"
        ? [
            today.getFullYear(),
            String(today.getMonth() + 1).padStart(2, "0"),
            String(today.getDate()).padStart(2, "0"),
          ].join("-")
        : value || "",
    ]),
  );
}

type EditorInputProps = {
  id?: string;
  type?: string;
  placeholder: string;
  readOnly?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};
const defaultArrivalTime = new Date(2000, 0, 1, 9);
const EditorInput = ({
  type = "text",
  value = "",
  onChange = () => {},
  ...props
}: EditorInputProps) => {
  if (type === "date" || type === "datetime-local") {
    const timed = type === "datetime-local";
    return (
      <DatePicker<false, Date>
        {...props}
        locale={datePickerLocaleZhCN}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
          }
        }}
        format={timed ? "YYYY-MM-DD HH:mm" : "YYYY-MM-DD"}
        showTime={
          timed
            ? { format: "HH:mm", defaultOpenValue: defaultArrivalTime }
            : false
        }
        value={value ? new Date(timed ? value : value + "T00:00") : null}
        onChange={(_, text) => onChange(text?.replace(" ", "T") ?? "")}
      />
    );
  }
  if (["money", "integer", "number"].includes(type)) {
    const money = type === "money";
    return (
      <InputNumber
        {...props}
        min={0}
        step={money ? 0.01 : 1}
        format={{ useGrouping: false, maximumFractionDigits: money ? 2 : 0 }}
        value={value == null || value === "" ? null : Number(value)}
        onChange={(next) => onChange(next === null ? "" : String(next))}
      />
    );
  }
  if (type === "password") {
    return (
      <InputPassword
        {...props}
        value={value}
        visibilityToggleLabels={{ show: "显示授权码", hide: "隐藏授权码" }}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <Input
      {...props}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
};
const Field = ({
  name,
  label,
  required = true,
  validate,
  ...input
}: EditorInputProps & {
  name: string;
  label: string;
  required?: boolean;
  validate?: (value: string) => string | undefined;
}) => {
  return (
    <Form.Field
      name={name}
      label={label}
      emptyValue=""
      required={required && "请填写" + label}
      validate={(value) => {
        const text = String(value ?? "");
        if (required && !text.trim()) {
          return "请填写" + label;
        }
        return validate?.(text);
      }}
    >
      <EditorInput {...input} />
    </Form.Field>
  );
};
const PageViewport = ({
  fixed,
  children,
}: {
  fixed: boolean;
  children: React.ReactNode;
}) =>
  fixed ? (
    <div {...p(s.fixedViewport)}>{children}</div>
  ) : (
    <ScrollArea
      {...p(s.scrollArea)}
      disableContentFit
      viewportProps={{
        ...p(s.viewport),
        tabIndex: 0,
        role: "region",
        "aria-label": "页面内容区",
      }}
    >
      {children}
    </ScrollArea>
  );
const EditorForm = ({
  className,
  children,
  values,
  onSubmit,
}: {
  className?: string;
  children: React.ReactNode;
  values: Record<string, unknown>;
  onSubmit: () => void;
}) => {
  const form = useForm({ initialValues: values, onSubmit });
  // External changes include the port suggested by TLS mode and a cleared saved password.
  useLayoutEffect(() => {
    for (const [key, value] of Object.entries(values)) {
      if (!Object.is(form.getValue(key), value)) {
        form.setValue(key, value);
      }
    }
  }, [form, values]);
  return (
    <Form className={className} form={form} layout="vertical">
      {children}
    </Form>
  );
};
const LayoutSettings = ({
  notice,
  onChange,
}: {
  notice: Notice;
  onChange: (notice: Notice) => void;
}) => {
  return (
    <div {...p(s.layoutSettings)}>
      <Popover
        trigger="click"
        placement="bottomLeft"
        popupProps={{ "aria-label": "A4 排版设置" }}
        content={
          <div {...p(s.layoutFields)}>
            {(Object.keys(layoutFields) as (keyof typeof layoutFields)[]).map(
              (key) => {
                const { label, min, max, step } = layoutFields[key];
                return (
                  <Form.Field
                    key={key}
                    name={key}
                    label={label}
                    required={"请填写" + label}
                    validate={(v) =>
                      Number.isFinite(v) && v >= min && v <= max
                        ? undefined
                        : label + "须介于 " + min + " 和 " + max + " 之间"
                    }
                  >
                    <InputNumber
                      placeholder={min + "–" + max}
                      min={min}
                      max={max}
                      step={step}
                      value={notice[key]}
                      onChange={(value) =>
                        onChange({ ...notice, [key]: value })
                      }
                    />
                  </Form.Field>
                );
              },
            )}
          </div>
        }
      >
        <Button type="text">A4 排版</Button>
      </Popover>
    </div>
  );
};
const ContentHeader = ({
  children,
  inert,
}: {
  children: React.ReactNode;
  inert: boolean;
}) => {
  return (
    <div inert={inert} aria-label="内容区页头" {...p(s.pageHeader)}>
      {children}
    </div>
  );
};
const NoticePreview = ({
  disabled,
  onPreview,
}: {
  disabled: boolean;
  onPreview: () => void;
}) => {
  const form = useFormInstance();
  return (
    <Button
      type="text"
      disabled={disabled}
      onClick={async () => {
        if ((await form.validate()).valid) {
          onPreview();
        }
      }}
    >
      预览 PDF
    </Button>
  );
};
const Card = ({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) => {
  return (
    <section {...p(s.card)}>
      {title && <h2 {...p(s.title)}>{title}</h2>}
      {children}
    </section>
  );
};
const Status = ({ value }: { value: Log["status"] }) => {
  const colors = {
    待发送: "gold",
    发送中: "blue",
    已发送: "green",
    失败: "red",
    待核实: "orange",
  };
  return (
    <Tag {...p(s.statusTag)} color={colors[value]}>
      {value}
    </Tag>
  );
};
const App = () => {
  const [tab, setTab] = useState<Tab>("首页");
  const tabList = React.useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    tabList.current
      ?.querySelector('[aria-selected="true"]')
      ?.parentElement?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab]);
  const [openTabs, setOpenTabs] = useState<Tab[]>(["首页"]);
  function activateTab(next: Tab) {
    setOpenTabs((prev) => (prev.includes(next) ? prev : [...prev, next]));
    setTab(next);
  }
  function closeTab(closing: Tab) {
    const index = openTabs.indexOf(closing);
    setOpenTabs(openTabs.filter((item) => item !== closing));
    if (tab === closing) {
      setTab(openTabs[index - 1]);
    }
  }
  const [drawer, setDrawer] = useState<HistoryDrawer | null>(null);
  const [catalog, setCatalog] = useState<Catalog>({
    companies: [],
    departments: [],
  });
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [editId, setEditId] = useState<string | null>(null);
  const [resendTarget, setResendTarget] = useState<Log | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Log | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [values, setValues] = useState(initialValues);
  const [record, setRecord] = useState<RecordDetail | null>(null);
  useEffect(() => {
    if (drawer !== "记录详情") {
      return;
    }
    const images = record?.hasNewTemplateImages
      ? toast.info("模板新增了图片，点击「更新邮件和 PDF」即可使用。")
      : undefined;
    return () => {
      images?.close();
    };
  }, [drawer, record?.id, record?.hasNewTemplateImages]);

  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [savedSettings, setSavedSettings] = useState<Settings | null>(null);
  const needsPassword =
    !savedSettings?.hasPassword ||
    (["host", "port", "mode", "user"] as const).some(
      (key) => settings?.[key] !== savedSettings[key],
    );
  const [password, setPassword] = useState("");
  const [mail, setMail] = useState<Mail>({ subject: "", richText: "" });
  const [templateOptions, setTemplateOptions] = useState<
    State["templateOptions"]
  >({ mail: [], notice: [] });
  const [customVariables, setCustomVariables] = useState<
    State["customVariables"]
  >([]);
  const editorFields = React.useMemo(
    () => [...templateFields, ...customVariables.map((v) => [v.key, v.label])],
    [customVariables],
  );
  function referencedFormKeys(form: Record<string, string>) {
    return new Set(
      (["mail", "notice"] as const).flatMap(
        (kind) =>
          templateOptions[kind].find(
            (t) => t.value === (form[kind + "TemplateId"] ?? "default"),
          )?.variableKeys ?? [],
      ),
    );
  }
  const selectedKeys = referencedFormKeys(values);

  const offerVariables = customVariables.filter((v) => selectedKeys.has(v.key));
  const [templateIds, setTemplateIds] = useState({
    mail: "default",
    notice: "default",
  });
  const drafts = React.useRef({
    mail: new Map<string, Mail>(),
    notice: new Map<string, Notice>(),
  });

  async function switchTemplate(kind: "mail" | "notice", id: string) {
    if (kind === "mail") {
      drafts.current.mail.set(templateIds.mail, mail);
      setMail(
        drafts.current.mail.get(id) ?? (await api.readTemplate("mail", id)),
      );
    } else {
      if (notice) {
        drafts.current.notice.set(templateIds.notice, notice);
      }
      setNotice(
        drafts.current.notice.get(id) ?? (await api.readTemplate("notice", id)),
      );
    }
    setTemplateIds((prev) => ({ ...prev, [kind]: id }));
  }
  async function saveNamedTemplate(
    kind: "mail" | "notice",
    name: string,
    copy: boolean,
  ) {
    const sourceId = templateIds[kind];
    let id: string;
    if (!copy) {
      id = await api.renameTemplate(kind, sourceId, name);
    } else if (kind === "mail") {
      id = await api.saveTemplate(mail, null, name);
      drafts.current.mail.set(sourceId, mail);
    } else {
      if (!notice) {
        throw Error("附件模板尚未加载");
      }
      id = await api.saveNotice(notice, null, name);
      drafts.current.notice.set(sourceId, notice);
    }
    setTemplateOptions(await api.templateOptions());
    setTemplateIds((prev) => ({ ...prev, [kind]: id }));
    toast.success("模板已保存");
  }
  const [filter, setFilter] = useState(emptyFilter);
  const [historyPage, setHistoryPage] = useState(1);
  function updateFilter(next: typeof emptyFilter) {
    setFilter(next);
    setHistoryPage(1);
  }
  const [history, setHistory] = useState<State["history"]>([]);
  const filtered = filterHistory(history, filter);
  const [busy, setBusy] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  useEffect(() => {
    api
      .state()
      .then((data) => {
        setTemplateOptions(data.templateOptions);
        setCustomVariables(data.customVariables);
        setCatalog(data.catalog);
        setSettings(data.settings);
        setSavedSettings(data.settings);
        setMail(data.template);
        setNotice(data.notice);
        setHistory(data.history);
      })
      .catch((e) => toast.error(String(e)));
  }, []);
  async function run(action: () => Promise<void>) {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await action();
    } catch (e) {
      toast.error(
        String(e)
          .replace(/^.*?Error: (?:Error: )?/, "")
          .replace(/^Error invoking remote method '[^']+': Error: /, ""),
      );
    } finally {
      setBusy(false);
    }
  }
  function closeDrawer() {
    if (!busy) {
      setDrawer(null);
    }
  }
  function changeConfig<K extends keyof Settings>(key: K, value: Settings[K]) {
    if (settings) {
      setSettings({ ...settings, [key]: value });
    }
    setSettingsDirty(true);
  }
  function choiceOptions(key: string) {
    const options =
      key === "company"
        ? catalog.companies.map((c) => c.name)
        : catalog.departments;
    const archived = original[key];
    const includeArchived = archived && !options.includes(archived);
    return [
      ...options.map((v) => ({ label: v, value: v })),
      ...(includeArchived
        ? [{ label: archived + "（历史值）", value: archived }]
        : []),
    ];
  }
  const action = (
    title: string,
    fn: () => Promise<void>,
    type: "default" | "text" | "primary" = "text",
    disabled = false,
  ) => (
    <Button
      disabled={busy || disabled}
      type={type}
      onClick={() => void run(fn)}
    >
      {title}
    </Button>
  );
  const currentCc = (recipient: string) =>
    parseCc(savedSettings?.cc, recipient).addresses.join(", ");
  const resendCc = resendTarget ? currentCc(resendTarget.recipient) : "";
  const resendDialog = (
    <Modal
      open={!!resendTarget}
      title="再次发送这份 Offer？"
      okText="确认"
      cancelText="取消"
      confirmLoading={busy}
      onCancel={() => {
        if (!busy) {
          setResendTarget(null);
        }
      }}
      onOk={() =>
        void run(async () => {
          if (!resendTarget) {
            return;
          }
          try {
            await api.resend(resendTarget.id);
            toast.success(
              "Offer 已重发给" + (resendTarget.name || resendTarget.recipient),
            );
          } finally {
            setResendTarget(null);
            setHistory((await api.state()).history);
            if (drawer === "记录详情") {
              setRecord(await api.record(resendTarget.id));
            }
          }
        })
      }
    >
      {resendTarget && (
        <p>
          将使用当前发件账号，把「{resendTarget.subject}」的原邮件正文和 PDF
          再次发送至 {resendTarget.recipient}
          {resendCc && "，抄送至 " + resendCc}。
        </p>
      )}
    </Modal>
  );
  return (
    <TabsRoot
      {...p(s.app)}
      value={tab}
      onValueChange={(next) => {
        if (next && next in tabIcons) {
          activateTab(next as Tab);
        }
      }}
    >
      <header
        aria-label="工作区标题栏"
        style={{ height: titleBarHeight }}
        inert={!!drawer}
        {...p(
          s.titleBar,
          api.platform === "darwin" ? s.macTitleBar : s.overlayTitleBar,
        )}
      >
        <TabsList
          ref={tabList}
          variant="point"
          aria-label="工作区标签"
          {...p(s.tabList)}
        >
          {openTabs.map((name) => {
            const Icon = tabIcons[name];
            return (
              <div key={name} {...p(s.tabGroup, name === tab && s.selectedTab)}>
                <TabsTab
                  variant="point"
                  disabled={busy}
                  value={name}
                  {...p(s.workspaceTab)}
                >
                  <Icon size={15} aria-hidden />
                  <span>{name}</span>
                </TabsTab>
                {name !== "首页" && (
                  <ActionIcon
                    size="small"
                    disabled={busy}
                    {...p(s.titleIcon)}
                    icon={X}
                    title={"关闭" + name}
                    aria-label={"关闭" + name}
                    onClick={() => closeTab(name)}
                  />
                )}
              </div>
            );
          })}
        </TabsList>
        <div {...p(s.globalActions)}>
          <DropdownMenu
            placement="bottomRight"
            items={settingsPages.map((name) => ({
              key: name,
              label: name,
              icon: tabIcons[name],
              onClick: () => activateTab(name),
            }))}
          >
            <ActionIcon
              disabled={busy}
              {...p(s.titleIcon)}
              icon={Settings2}
              variant="outlined"
              size={{ size: 17, blockSize: 30, borderRadius: "50%" }}
              title="设置"
              aria-label="设置"
            />
          </DropdownMenu>
        </div>
      </header>
      {openTabs.map((pageTab) => {
        const templatePage = pageTab === "邮件模板" || pageTab === "附件模板";
        const templateKind = pageTab === "邮件模板" ? "mail" : "notice";
        return (
          <TabsPanel key={pageTab} value={pageTab} keepMounted {...p(s.panel)}>
            <div {...p(s.panelLayout, pageTab !== "首页" && s.settingsPanel)}>
              {pageTab === "首页" && (
                <ContentHeader inert={!!drawer}>
                  <EditorForm
                    values={filter}
                    onSubmit={() => setHistoryPage(1)}
                  >
                    <div {...p(s.filters)}>
                      <Form.Field
                        layout="horizontal"
                        minWidth="calc(100% - 3em)"
                        {...p(s.historyFilterField)}
                        name="query"
                        label="姓名"
                      >
                        <Input
                          allowClear
                          placeholder="输入候选人姓名"
                          onChange={(e) =>
                            updateFilter({ ...filter, query: e.target.value })
                          }
                        />
                      </Form.Field>
                      {(["company", "department", "status"] as const).map(
                        (key) => {
                          const label = {
                            company: "公司",
                            department: "部门",
                            status: "状态",
                          }[key];
                          const choices =
                            key === "status"
                              ? ["待发送", "发送中", "已发送", "失败", "待核实"]
                              : Array.from(
                                  new Set(
                                    history
                                      .map((r) => r[key])
                                      .filter((v): v is string => !!v),
                                  ),
                                ).sort((a, b) => a.localeCompare(b, "zh-CN"));
                          return (
                            <Form.Field
                              layout="horizontal"
                              {...p(s.historyFilterField)}
                              minWidth="calc(100% - 3em)"
                              key={key}
                              label={label}
                              name={key}
                            >
                              <Select
                                allowClear
                                placeholder={"请选择" + label}
                                options={choices.map((v) => ({
                                  label: v,
                                  value: v,
                                }))}
                                onChange={(v) =>
                                  updateFilter({
                                    ...filter,
                                    [key]: typeof v === "string" ? v : "",
                                  })
                                }
                              />
                            </Form.Field>
                          );
                        },
                      )}
                      <Button
                        {...p(s.windowAction)}
                        type="primary"
                        disabled={busy}
                        onClick={() => {
                          setEditId(null);
                          setOriginal({});
                          const company = catalog.companies[0];
                          setValues({
                            ...initialValues(),
                            mailTemplateId: "default",
                            noticeTemplateId: "default",
                            company: company?.name ?? "",
                            address: company?.address ?? "",
                            department: "",
                          });
                          setDrawer("新增 Offer");
                        }}
                      >
                        新增
                      </Button>
                    </div>
                  </EditorForm>
                </ContentHeader>
              )}
              <PageViewport fixed={templatePage}>
                <main
                  inert={!!drawer}
                  aria-label={pageTab}
                  {...p(
                    s.main,
                    pageTab !== "首页" && s.settingsMain,
                    templatePage && s.templateMain,
                  )}
                >
                  {pageTab === "变量管理" && (
                    <VariableSettings
                      variables={customVariables}
                      onChange={setCustomVariables}
                    />
                  )}
                  {(pageTab === "邮件模板" ||
                    (pageTab === "附件模板" && notice)) && (
                    <EditorForm
                      {...p(s.templateForm)}
                      key={templateIds[templateKind]}
                      values={pageTab === "邮件模板" ? mail : notice!}
                      onSubmit={() =>
                        void run(async () => {
                          if (pageTab === "邮件模板") {
                            await api.saveTemplate(mail, templateIds.mail);
                          } else if (notice) {
                            await api.saveNotice(notice, templateIds.notice);
                          }
                          setTemplateOptions(await api.templateOptions());
                          toast.success(pageTab + "已保存");
                        })
                      }
                    >
                      <TemplatePicker
                        label={pageTab}
                        id={templateIds[templateKind]}
                        options={templateOptions[templateKind]}
                        busy={busy}
                        select={(id) =>
                          void run(() => switchTemplate(templateKind, id))
                        }
                        save={(name, copy) =>
                          saveNamedTemplate(templateKind, name, copy)
                        }
                        preview={
                          pageTab === "附件模板" &&
                          notice && (
                            <NoticePreview
                              disabled={busy}
                              onPreview={() =>
                                void run(() => api.previewNotice(notice))
                              }
                            />
                          )
                        }
                      />
                      {pageTab === "邮件模板" && (
                        <TemplateSplit
                          preview={<MailPreview template={mail} />}
                        >
                          <React.Suspense fallback={<p>正在加载编辑器…</p>}>
                            <Form.Field
                              name="subject"
                              label="邮件主题"
                              validate={(v) =>
                                templateError(v, true, false, customVariables)
                              }
                            >
                              <SubjectEditor
                                fields={editorFields}
                                value={mail.subject}
                                onChange={(subject) =>
                                  setMail({ ...mail, subject })
                                }
                              />
                            </Form.Field>
                            <Form.Field
                              name="richText"
                              label="邮件正文"
                              validate={(html) =>
                                richTextError(html, "邮件正文", customVariables)
                              }
                            >
                              <TemplateEditor
                                fields={editorFields}
                                mail
                                label="邮件正文"
                                placeholder="编写邮件正文"
                                value={mail.richText}
                                onChange={(richText) =>
                                  setMail({ ...mail, richText })
                                }
                              />
                            </Form.Field>
                          </React.Suspense>
                        </TemplateSplit>
                      )}
                      {pageTab === "附件模板" && notice && (
                        <TemplateSplit
                          previewTools={
                            <LayoutSettings
                              notice={notice}
                              onChange={setNotice}
                            />
                          }
                          preview={
                            <React.Suspense fallback={<p>正在加载预览…</p>}>
                              <LiveNotice layout={notice} />
                            </React.Suspense>
                          }
                        >
                          <React.Suspense fallback={<p>正在加载编辑器…</p>}>
                            <Form.Field
                              name="richText"
                              style={{ gap: 0 }}
                              validate={(html) =>
                                richTextError(html, "附件内容", customVariables)
                              }
                            >
                              <TemplateEditor
                                fields={editorFields}
                                label="附件内容"
                                placeholder="编写通知书"
                                value={notice.richText}
                                onChange={(richText) =>
                                  setNotice({ ...notice, richText })
                                }
                              />
                            </Form.Field>
                          </React.Suspense>
                        </TemplateSplit>
                      )}
                    </EditorForm>
                  )}

                  {(pageTab === "公司设置" || pageTab === "部门设置") && (
                    <CatalogSettings
                      kind={
                        pageTab === "公司设置" ? "companies" : "departments"
                      }
                      catalog={catalog}
                      onChange={setCatalog}
                    />
                  )}
                  {pageTab === "邮箱设置" && settings && (
                    <EditorForm
                      values={{
                        ...settings,
                        password,
                        port: String(settings.port || ""),
                      }}
                      onSubmit={() => {
                        void run(async () => {
                          const saved = await api.saveSettings({
                            ...settings,
                            password,
                          });
                          setSettings(saved);
                          setSavedSettings(saved);
                          setPassword("");
                          setSettingsDirty(false);
                          toast.success("邮箱设置已保存");
                        });
                      }}
                    >
                      <Card>
                        <div {...p(s.grid)}>
                          <Field
                            name="host"
                            validate={(v) =>
                              /[\s/]/.test(v)
                                ? "请输入有效的 SMTP 主机名"
                                : undefined
                            }
                            label="SMTP 服务器"
                            placeholder="例如 smtp.example.com"
                            value={settings.host}
                            onChange={(v) => changeConfig("host", v)}
                          />
                          <Field
                            name="port"
                            validate={(v) =>
                              !Number.isInteger(Number(v)) ||
                              Number(v) < 1 ||
                              Number(v) > 65535
                                ? "端口须为 1 至 65535 的整数"
                                : undefined
                            }
                            label="端口"
                            placeholder={
                              settings.mode === "tls" ? "例如 465" : "例如 587"
                            }
                            type="number"
                            value={String(settings.port || "")}
                            onChange={(v) => changeConfig("port", Number(v))}
                          />
                          <Form.Field
                            name="mode"
                            label="连接加密"
                            required="请选择连接加密方式"
                          >
                            <Select
                              placeholder="请选择连接加密方式"
                              options={[
                                { label: "TLS", value: "tls" },
                                { label: "STARTTLS", value: "starttls" },
                              ]}
                              value={settings.mode}
                              onChange={(mode) => {
                                if (mode !== "tls" && mode !== "starttls") {
                                  return;
                                }
                                setSettings({
                                  ...settings,
                                  mode,
                                  port: mode === "tls" ? 465 : 587,
                                });
                                setSettingsDirty(true);
                              }}
                            />
                          </Form.Field>
                          <Field
                            name="user"
                            label="登录账号"
                            placeholder="请输入企业邮箱登录账号"
                            value={settings.user}
                            onChange={(v) => changeConfig("user", v)}
                          />
                          <Field
                            name="password"
                            label="客户端授权码"
                            type="password"
                            required={needsPassword}
                            placeholder={
                              !needsPassword
                                ? "已保存，留空沿用"
                                : "请输入邮箱客户端授权码"
                            }
                            value={password}
                            onChange={(v) => {
                              setPassword(v);
                              setSettingsDirty(true);
                            }}
                          />
                          <Field
                            name="from"
                            validate={(v) =>
                              emailOK(v) ? undefined : "请输入有效的邮箱地址"
                            }
                            label="发件邮箱"
                            placeholder="例如 hr@example.com"
                            type="email"
                            value={settings.from}
                            onChange={(v) => changeConfig("from", v)}
                          />
                          <Field
                            name="sender"
                            label="发件人显示名称"
                            placeholder="选填，例如 招聘团队"
                            required={false}
                            value={settings.sender}
                            onChange={(v) => changeConfig("sender", v)}
                          />
                          <Form.Field
                            {...p(s.fullRow)}
                            name="cc"
                            label="抄送邮箱"
                            emptyValue=""
                            validate={(v) => parseCc(v).error}
                          >
                            <CcInput
                              onChange={(cc) => changeConfig("cc", cc)}
                            />
                          </Form.Field>
                        </div>
                      </Card>
                      <div {...p(s.row)}>
                        <Button
                          htmlType="submit"
                          type="primary"
                          disabled={busy}
                        >
                          保存设置
                        </Button>
                        {action(
                          "测试连接",
                          async () => {
                            await api.verify();
                            toast.success("发件邮箱连接成功");
                          },
                          "default",
                          settingsDirty || !settings.hasPassword,
                        )}
                      </div>
                    </EditorForm>
                  )}
                  {pageTab === "首页" && (
                    <>
                      <Table<Log>
                        rowKey="id"
                        scroll={{ x: 1920 }}
                        variant="outlined"
                        dataSource={filtered}
                        pagination={{
                          current: Math.min(
                            historyPage,
                            Math.max(1, Math.ceil(filtered.length / 10)),
                          ),
                          onChange: (page) => setHistoryPage(page),
                          pageSize: 10,
                          showSizeChanger: false,
                          showTitle: false,
                          itemRender: (page, type, element) => (
                            <span
                              title={
                                {
                                  prev: "上一页",
                                  next: "下一页",
                                  "jump-prev": "向前翻页",
                                  "jump-next": "向后翻页",
                                  page: "第 " + page + " 页",
                                }[type]
                              }
                            >
                              {element}
                            </span>
                          ),
                          hideOnSinglePage: true,
                        }}
                        locale={{
                          emptyText: Object.values(filter).some(Boolean)
                            ? "没有匹配的发送记录"
                            : "暂无发送记录",
                        }}
                        columns={[
                          {
                            title: "候选人",
                            dataIndex: "name",
                            width: 100,
                            render: (v) => v || "—",
                          },
                          {
                            title: "收件邮箱",
                            dataIndex: "recipient",
                            width: 190,
                            ellipsis: true,
                          },
                          {
                            title: "状态",
                            align: "center",
                            width: 110,
                            dataIndex: "status",
                            render: (_, r) => <Status value={r.status} />,
                          },
                          {
                            title: "公司",
                            dataIndex: "company",
                            width: 280,
                            ellipsis: true,
                            render: (v) => v || "—",
                          },
                          {
                            title: "部门",
                            dataIndex: "department",
                            width: 180,
                            ellipsis: true,
                            render: (v) => v || "—",
                          },
                          {
                            title: "岗位",
                            dataIndex: "role",
                            width: 190,
                            ellipsis: true,
                            render: (v) => v || "—",
                          },
                          {
                            title: "报到时间",
                            dataIndex: "arrival",
                            width: 200,
                            ellipsis: true,
                            render: (v) => formatDateTime(v, "minute"),
                          },
                          {
                            title: "邮件主题",
                            dataIndex: "subject",
                            ellipsis: true,
                          },
                          {
                            title: "创建时间",
                            dataIndex: "created",
                            width: 205,
                            ellipsis: true,
                            render: (time) => formatDateTime(time),
                          },
                          {
                            title: "操作",
                            align: "center",
                            fixed: "right",
                            width: 200,
                            key: "actions",
                            render: (_, r) => (
                              <div {...p(s.tableActions)}>
                                <Button
                                  type="link"
                                  size="small"
                                  disabled={busy}
                                  onClick={() =>
                                    void run(async () => {
                                      const detail = await api.record(r.id);
                                      setRecord(detail);
                                      setDrawer("记录详情");
                                      if (detail.status === "待核实") {
                                        toast.info(
                                          "请先核实这封邮件是否发出，再选择核实结果。",
                                        );
                                      }
                                    })
                                  }
                                >
                                  查看详情
                                </Button>
                                {r.status === "已发送" && (
                                  <>
                                    <Divider orientation="vertical" />
                                    <Button
                                      type="link"
                                      size="small"
                                      disabled={busy}
                                      onClick={() => setResendTarget(r)}
                                    >
                                      重发
                                    </Button>
                                  </>
                                )}
                                {r.status === "待发送" && (
                                  <>
                                    <Divider orientation="vertical" />
                                    <Button
                                      type="link"
                                      size="small"
                                      disabled={busy}
                                      onClick={() =>
                                        void run(async () => {
                                          const draft = await api.draft(r.id);
                                          setEditId(r.id);
                                          setOriginal(draft.values);
                                          setValues(draft.values);
                                          setDrawer("编辑 Offer");
                                        })
                                      }
                                    >
                                      编辑
                                    </Button>
                                    <Divider orientation="vertical" />
                                    <Button
                                      type="link"
                                      size="small"
                                      danger
                                      disabled={busy}
                                      onClick={() => setRemoveTarget(r)}
                                    >
                                      删除
                                    </Button>
                                  </>
                                )}
                              </div>
                            ),
                          },
                        ]}
                      />
                    </>
                  )}
                </main>
              </PageViewport>
            </div>
          </TabsPanel>
        );
      })}
      {!drawer && resendDialog}
      <Modal
        open={!!removeTarget}
        title="删除待发送 Offer？"
        okText="删除"
        cancelText="取消"
        confirmLoading={busy}
        okButtonProps={{ danger: true }}
        onCancel={() => {
          if (!busy) {
            setRemoveTarget(null);
          }
        }}
        onOk={() =>
          void run(async () => {
            if (!removeTarget) {
              return;
            }
            await api.deleteOffer(removeTarget.id);
            setRemoveTarget(null);
            setHistory((await api.state()).history);
            toast.success("待发送 Offer 已删除");
          })
        }
      >
        {removeTarget && (
          <p>
            将删除「{removeTarget.subject}」（{removeTarget.recipient}）及其 PDF
            附件，此操作无法撤销。
          </p>
        )}
      </Modal>
      <Drawer
        open={drawer !== null}
        title={drawer}
        extra={
          drawer === "记录详情" &&
          record && (
            <div
              role="group"
              aria-label="详情操作"
              {...p(s.row, s.detailActions)}
            >
              {action("打开 PDF", () => api.openPdf(record.id))}
              {action("导出 PDF", () => api.exportPdf(record.id))}
              {record.status === "待核实" && (
                <>
                  {[true, false].map((accepted) => (
                    <Button
                      type="default"
                      key={String(accepted)}
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await api.reconcile(record.id, accepted);
                          setRecord(await api.record(record.id));
                          setHistory((await api.state()).history);
                        })
                      }
                    >
                      {accepted ? "已核实：已发送" : "已核实：服务器未接收"}
                    </Button>
                  ))}
                </>
              )}
              {record.templatesChanged && (
                <Button
                  type="text"
                  loading={refreshing}
                  disabled={refreshing || (busy && !sending)}
                  onClick={async () => {
                    setRefreshing(true);
                    try {
                      const draft = await api.draft(record.id);
                      const missing = [
                        ...referencedFormKeys(draft.values),
                      ].some((key) => !draft.values[key]?.trim());
                      if (missing) {
                        setEditId(record.id);
                        setOriginal(draft.values);
                        setValues(draft.values);
                        setDrawer("更新邮件和 PDF");
                        toast.info("请填写模板新增的变量后保存。");
                        return;
                      }
                      await api.refreshOffer(record.id);
                      setRecord(await api.record(record.id));
                      setHistory((await api.state()).history);
                      toast.success("邮件和 PDF 已更新");
                    } catch (error) {
                      toast.error(
                        String(error).split("Error: ").pop() || "更新失败",
                      );
                    } finally {
                      setRefreshing(false);
                    }
                  }}
                >
                  更新邮件和 PDF
                </Button>
              )}
              {record.status === "已发送" && (
                <Button
                  type="primary"
                  disabled={busy}
                  onClick={() => setResendTarget(record)}
                >
                  重发
                </Button>
              )}
              {["待发送", "失败"].includes(record.status) &&
                action(
                  record.status === "失败" ? "重发" : "发送",
                  async () => {
                    setSending(true);
                    try {
                      await api.send(record.id);
                      setDrawer((current) =>
                        current === "记录详情" ? null : current,
                      );
                      toast.success(
                        "Offer 已发给" + (record.name || record.recipient),
                      );
                    } finally {
                      setSending(false);
                      setRecord(await api.record(record.id));
                      setHistory((await api.state()).history);
                    }
                  },
                  "primary",
                  !settings?.hasPassword,
                )}
              <Popover
                key={record.id}
                trigger="click"
                placement="bottomRight"
                popupProps={{ "aria-label": "状态记录" }}
                content={
                  <section {...p(s.eventHistory)}>
                    <h3 {...p(s.historyHeading)}>状态记录</h3>
                    {record.events.length ? (
                      record.events.map((event, index) => (
                        <div key={index} {...p(s.event)}>
                          <Status value={event.status} />
                          <time dateTime={event.time}>
                            {formatDateTime(event.time)}
                          </time>
                          {event.detail && (
                            <div {...p(s.eventDetail)}>{event.detail}</div>
                          )}
                        </div>
                      ))
                    ) : (
                      <span>暂无状态记录</span>
                    )}
                  </section>
                }
              >
                <ActionIcon
                  icon={History}
                  title="状态记录"
                  aria-label="状态记录"
                />
              </Popover>
            </div>
          )
        }
        width="min(1080px, calc(100vw - 64px))"
        placement="right"
        push={false}
        closable={!busy}
        keyboard={!busy}
        maskClosable={drawer === "记录详情" && !busy}
        onClose={closeDrawer}
        classNames={{ content: "offer-drawer-scroll" }}
        styles={{
          popup: { insetBlockStart: titleBarHeight },
          header: { boxSizing: "border-box", minHeight: 46, paddingBlock: 6 },
          title: { fontSize: 15, lineHeight: "20px" },
          bodyContent: { backgroundColor: "#f8faf8", minHeight: "100%" },
        }}
      >
        {(drawer === "新增 Offer" ||
          drawer === "编辑 Offer" ||
          drawer === "更新邮件和 PDF") && (
          <EditorForm
            values={values}
            onSubmit={() => {
              void run(async () => {
                if (editId && drawer === "更新邮件和 PDF") {
                  await api.refreshOffer(editId, values);
                  setRecord(await api.record(editId));
                  setHistory((await api.state()).history);
                  setDrawer("记录详情");
                  toast.success("邮件和 PDF 已更新");
                  return;
                }
                if (editId) {
                  await api.editOffer(editId, values);
                } else {
                  await api.createOffer(values);
                }
                setHistory((await api.state()).history);
                setDrawer(null);
                toast.success(
                  editId ? "Offer 修改已保存" : "Offer 已保存，等待发送",
                );
              });
            }}
          >
            {drawer !== "更新邮件和 PDF" && (
              <Card title="使用模板">
                <div {...p(s.grid)}>
                  {(["mail", "notice"] as const).map((kind) => {
                    const field = kind + "TemplateId";
                    const label = kind === "mail" ? "邮件模板" : "附件模板";
                    return (
                      <Form.Field
                        key={field}
                        name={field}
                        label={label}
                        required={"请选择" + label}
                      >
                        <Select
                          placeholder={"请选择" + label}
                          options={templateOptions[kind]}
                          onChange={(id) => {
                            if (typeof id === "string") {
                              setValues({ ...values, [field]: id });
                            }
                          }}
                        />
                      </Form.Field>
                    );
                  })}
                </div>
              </Card>
            )}
            {offerVariables.length > 0 && (
              <Card title="自定义变量">
                <div {...p(s.grid)}>
                  {offerVariables.map(({ key, label }) => (
                    <Field
                      key={key}
                      name={key}
                      label={label}
                      placeholder={"请输入" + label}
                      value={values[key] ?? ""}
                      validate={(v) => offerFieldError(v, label, "text")}
                      onChange={(v) => setValues({ ...values, [key]: v })}
                    />
                  ))}
                </div>
              </Card>
            )}
            {drawer !== "更新邮件和 PDF" &&
              groups.map(([title, start, end]) => (
                <Card key={title} title={title}>
                  <div {...p(s.grid)}>
                    {fields
                      .slice(start, end)
                      .map(([key, label, kind, , placeholder]) =>
                        ["company", "department"].includes(key) ? (
                          <Form.Field
                            key={key}
                            name={key}
                            label={label}
                            required={"请选择" + label}
                          >
                            <Select
                              placeholder={placeholder}
                              options={choiceOptions(key)}
                              onChange={(v) => {
                                if (typeof v !== "string") {
                                  return;
                                }
                                if (key === "company" && v !== values.company) {
                                  setValues({
                                    ...values,
                                    company: v,
                                    address:
                                      v === original.company && original.address
                                        ? original.address
                                        : (catalog.companies.find(
                                            (c) => c.name === v,
                                          )?.address ?? ""),
                                  });
                                } else {
                                  setValues({ ...values, [key]: v });
                                }
                              }}
                            />
                          </Form.Field>
                        ) : (
                          <Field
                            key={key}
                            name={key}
                            validate={(v) => offerFieldError(v, label, kind)}
                            label={label}
                            placeholder={placeholder}
                            value={values[key] ?? ""}
                            readOnly={key === "address"}
                            type={kind || "text"}
                            onChange={(v) => setValues({ ...values, [key]: v })}
                          />
                        ),
                      )}
                  </div>
                </Card>
              ))}
            <div {...p(s.row, s.offerActions)}>
              <Button disabled={busy} onClick={closeDrawer}>
                取消
              </Button>
              <Button type="primary" htmlType="submit" loading={busy}>
                保存
              </Button>
            </div>
          </EditorForm>
        )}

        {drawer === "记录详情" && record && (
          <article {...p(s.mailDetail)}>
            <header {...p(s.envelope)}>
              <div {...p(s.row)}>
                <h2 {...p(s.subjectHeading)}>{record.subject}</h2>
                <Status value={sending ? "发送中" : record.status} />
              </div>
              <dl {...p(s.mailMetadata)}>
                {[
                  ["发件人", record.sender],
                  [
                    "本次发件邮箱",
                    ["待发送", "失败"].includes(record.status) &&
                      (savedSettings?.from || "请先在邮箱设置中保存发件邮箱"),
                  ],
                  [
                    "收件人",
                    [record.name, record.recipient].filter(Boolean).join(" · "),
                  ],
                  [
                    "抄送",
                    record.status === "待发送"
                      ? currentCc(record.recipient)
                      : record.cc,
                  ],
                  [
                    "本次重发抄送",
                    record.status === "失败" &&
                      currentCc(record.recipient) !== (record.cc ?? "") &&
                      (currentCc(record.recipient) || "无"),
                  ],
                  ["创建时间", formatDateTime(record.created)],
                  ["岗位", record.role],
                ].map(
                  ([label, value]) =>
                    value && (
                      <React.Fragment key={String(label)}>
                        <dt {...p(s.metadataLabel)}>{label}</dt>
                        <dd {...p(s.metadataValue)}>{value}</dd>
                      </React.Fragment>
                    ),
                )}
              </dl>
              <div {...p(s.attachment)} aria-label="附件">
                <Paperclip size={16} aria-hidden />
                <span>{record.filename}</span>
              </div>
            </header>
            {record.detail && <p {...p(s.muted)}>{record.detail}</p>}
            <section
              aria-label="邮件正文"
              {...p(s.mailPaper)}
              dangerouslySetInnerHTML={{ __html: record.html }}
            />
          </article>
        )}
        {drawer && resendDialog}
      </Drawer>
    </TabsRoot>
  );
};
export default App;

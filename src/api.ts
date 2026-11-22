import type layoutFields from "../templates/pdf-layout.json";
export type Notice = Record<keyof typeof layoutFields, number | null> & {
  richText: string;
};
export type Settings = {
  host: string;
  port: number;
  mode: string;
  user: string;
  from: string;
  sender: string;
  cc: string;
  hasPassword: boolean;
};
export type Mail = { subject: string; richText: string };
export type Company = {
  name: string;
  address: string;
  invoiceInfo: string;
  banks: string[];
};
export type Catalog = { companies: Company[]; departments: string[] };
export type Log = {
  id: string;
  created: string;
  recipient: string;
  cc?: string | null;
  filename: string;
  company?: string | null;
  department?: string | null;
  arrival?: string | null;
  sender: string;
  subject: string;
  name: string | null;
  role: string | null;
  status: "待发送" | "发送中" | "已发送" | "失败" | "待核实";
  detail: string;
};
export type RecordDetail = Log & {
  templatesChanged: boolean;
  hasNewTemplateImages?: boolean;
  html: string;
  body: string;
  events: { time: string; status: Log["status"]; detail: string }[];
};
export type CustomVariable = { key: string; label: string };
export type TemplateOptions = Record<
  "mail" | "notice",
  { value: string; label: string; variableKeys: string[] }[]
>;
export type State = {
  templateOptions: TemplateOptions;
  customVariables: CustomVariable[];
  catalog: Catalog;
  settings: Settings;
  notice: Notice;
  template: Mail;
  history: Log[];
};
declare global {
  interface Window {
    offerFlow: {
      platform: string;
      updateVariable(
        key: string | null,
        label: string | null,
      ): Promise<CustomVariable[]>;
      templateOptions(): Promise<TemplateOptions>;
      state(): Promise<State>;
      updateCatalog(
        kind: keyof Catalog,
        original: string | null,
        input: Company | string | null,
      ): Promise<Catalog>;
      renderPreview(layout: Notice): Promise<Uint8Array>;
      saveSettings(input: Settings & { password: string }): Promise<Settings>;
      verify(): Promise<void>;
      previewMail(template: Mail): Promise<{ subject: string; html: string }>;
      renameTemplate(
        kind: "mail" | "notice",
        id: string,
        name: string,
      ): Promise<string>;
      readTemplate(kind: "mail", id: string): Promise<Mail>;
      readTemplate(kind: "notice", id: string): Promise<Notice>;
      saveTemplate(
        template: Mail,
        id?: string | null,
        name?: string,
      ): Promise<string>;
      createOffer(values: Record<string, string>): Promise<string>;
      draft(id: string): Promise<{ values: Record<string, string> }>;
      refreshOffer(id: string, values?: Record<string, string>): Promise<void>;
      editOffer(id: string, values: Record<string, string>): Promise<void>;
      deleteOffer(id: string): Promise<void>;
      previewNotice(layout: Notice): Promise<void>;
      saveNotice(
        layout: Notice,
        id?: string | null,
        name?: string,
      ): Promise<string>;
      record(id: string): Promise<RecordDetail>;
      reconcile(id: string, accepted: boolean): Promise<void>;
      openPdf(id: string): Promise<void>;
      exportPdf(id: string): Promise<void>;
      resend(id: string): Promise<void>;
      send(id: string): Promise<void>;
    };
  }
}

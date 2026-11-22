import fields from "../templates/fields.json" with { type: "json" };
export const templateFields = [
  ...fields,
  ["invoiceInfo", "公司开票信息"],
  ["allowedBanks", "限定银行"],
];
const keys = new Set(templateFields.map(([key]) => key));
export const variablePattern = /{{[ \t]*(\w+)[ \t]*}}/g;
export const emailOK = (value) =>
  /^[^\s@<>,;:"]+@[^\s@<>,;:"]+\.[^\s@<>,;:"]+$/u.test(value);

export function parseCc(raw = "", recipient = "") {
  if (typeof raw !== "string" || /\p{Cc}/u.test(raw)) {
    return { error: "请检查抄送邮箱格式", addresses: [] };
  }
  const addresses = [];
  const seen = new Set([recipient.trim().toLowerCase()]);
  for (const part of raw.split(/[,，;；]/u)) {
    const address = part.trim();
    if (!address) {
      continue;
    }
    if (!emailOK(address)) {
      return { error: "抄送邮箱格式有误：" + address, addresses: [] };
    }
    const key = address.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      addresses.push(address);
    }
  }
  return { addresses, error: undefined };
}

/** @typedef {{key:string,label:string}} CustomVariable */
/** @param {CustomVariable[]} custom */
export function templateError(
  text,
  singleLine = false,
  optional = false,
  custom = [],
) {
  if (typeof text !== "string" || (!optional && !text.trim())) {
    return "请输入模板内容";
  }
  if (text.length > 30000) {
    return "模板内容最多 30000 个字符";
  }
  if (singleLine && /[\r\n]/.test(text)) {
    return "标题须为单行";
  }
  for (const [, key] of text.matchAll(variablePattern)) {
    if (!keys.has(key) && !custom.some((v) => v.key === key)) {
      return "未知模板变量：" + key;
    }
  }
  if (/{{|}}/.test(text.replace(variablePattern, ""))) {
    return "模板变量格式应为 {{字段名}}";
  }
}
export function offerFieldError(raw, label, type) {
  const value = String(raw ?? "").trim();
  if (!value) {
    return "请填写" + label;
  }
  if (value.length > 300 || /[\r\n]/.test(value)) {
    return "请检查" + label;
  }
  if (type === "email" && !emailOK(value)) {
    return "请输入有效的邮箱地址";
  }
  if (type === "money" && !/^\d+(\.\d{1,2})?$/.test(value)) {
    return label + "须为非负金额，最多两位小数";
  }
  if (type === "integer" && !/^\d+$/.test(value)) {
    return label + "须为非负整数";
  }
  if (
    ["date", "datetime-local"].includes(type) &&
    !Number.isFinite(Date.parse(value))
  ) {
    return "请选择有效的" + label;
  }
}

/** Saved rich text contains normalized tags. Only text nodes and the subject support substitution. */
export function referencedKeys(subject = "", html = "") {
  return [
    ...new Set(
      [subject, ...html.split(/<[^>]*>/g)].flatMap((text) =>
        Array.from(text.matchAll(variablePattern), (match) => match[1]),
      ),
    ),
  ];
}

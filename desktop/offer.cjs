const { formatDateTime } = require("../shared/date-time.mjs");
const { convert } = require("html-to-text");
const fields = require("../templates/fields.json");
const defaultMail = require("../templates/mail.json");
const notice = require("../templates/notice.json");
const layoutFields = require("../templates/pdf-layout.json");
const defaultNotice = {
  ...notice,
  ...Object.fromEntries(
    Object.entries(layoutFields).map(([key, field]) => [key, field.default]),
  ),
};
const { renderRichText } = require("./rich-notice.cjs");
function validateNotice(layout) {
  for (const [key, { label, min, max }] of Object.entries(layoutFields)) {
    if (
      !Number.isFinite(layout[key]) ||
      layout[key] < min ||
      layout[key] > max
    ) {
      throw Error(label + "须介于 " + min + " 和 " + max + " 之间");
    }
  }
}
const {
  emailOK,
  templateError,
  variablePattern,
  referencedKeys,
  offerFieldError,
} = require("../shared/validation.mjs");
function renderMail(template, values, custom = []) {
  const { subject, richText } = template;
  const error = templateError(subject, true, false, custom);
  if (error) {
    throw Error(error);
  }
  const content = renderRichText(richText, values, "邮件正文", custom).replace(
    /<p([^>]*)><\/p>/g,
    "<p$1><br></p>",
  );
  return {
    subject: subject.replace(variablePattern, (_, key) =>
      values[key].replace(/[\r\n]+/g, " "),
    ),
    html:
      '<div style="font-family:Arial,sans-serif;font-size:12pt;line-height:1.5;color:#222222">' +
      content +
      "</div>",
    body: convert(content, {
      wordwrap: false,
      selectors: [
        { selector: "img", options: { pathRewrite: () => "" } },
        ...["h1", "h2", "h3"].map((selector) => ({
          selector,
          options: { uppercase: false },
        })),
      ],
    }),
  };
}
/**
 * @param {Record<string, string>} input
 * @param {{subject:string,richText:string}} template
 * @param {typeof defaultNotice} [layout]
 * @param {{key:string,label:string}[]} [custom]
 */
function buildOffer(input, template, layout = defaultNotice, custom = []) {
  validateNotice(layout);
  const values = {
    invoiceInfo: String(input.invoiceInfo ?? ""),
    allowedBanks: String(input.allowedBanks ?? ""),
  };
  for (const [key, label, type] of fields) {
    const value = String(input[key] ?? "").trim();
    const error = offerFieldError(value, label, type);
    if (error) {
      throw Error(error);
    }
    values[key] =
      type === "datetime-local" ? formatDateTime(value, "minute") : value;
  }
  const noticeHtml = layout.richText;
  const used = new Set([
    ...referencedKeys(template.subject, template.richText),
    ...referencedKeys("", noticeHtml),
  ]);
  for (const { key, label } of custom) {
    if (!used.has(key)) {
      continue;
    }
    const error = offerFieldError(input[key], label, "text");
    if (error) {
      throw Error(error);
    }
    values[key] = input[key].trim();
  }
  const content = renderRichText(noticeHtml, values, "附件内容", custom);
  const document = `<!doctype html><meta charset="utf-8"><style>
    @page {size:A4; margin:${layout.verticalMargin}mm ${layout.horizontalMargin}mm}
    *{box-sizing:border-box}body{font:${layout.fontSize}pt/${layout.lineHeight} "Songti SC","SimSun","Noto Serif CJK SC",serif;color:#111;overflow-wrap:anywhere}
    h1{font-size:${layout.titleSize}pt;margin:0 0 6mm}
    p,h2{margin:${layout.paragraphGap}mm 0;white-space:pre-wrap}h2{font-size:${layout.fontSize + 1}pt;break-after:avoid}
    footer{margin-top:9mm;white-space:pre-wrap;break-inside:avoid}
    li p{margin:0}ul,ol{padding-inline-start:1.8em}p:empty::after{content:"\\00a0"}blockquote{border-inline-start:2px solid #bbb;padding-inline-start:1em}
    </style>${content}`;
  return {
    ...renderMail(template, values, custom),
    document,
    email: values.email,
    name: values.name,
  };
}
module.exports = {
  defaultNotice,
  renderMail,
  validateNotice,
  fields,
  defaultMail,
  buildOffer,
  emailOK,
};

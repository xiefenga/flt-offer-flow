const {
  imagePresentation,
  isMailImage,
  isWebLink,
  maxMailHtml,
} = require("../shared/mail-media.mjs");
const sanitize = require("sanitize-html");
const { templateError, variablePattern } = require("../shared/validation.mjs");

const escapeHtml = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function renderRichText(html, values, label = "附件内容", custom = []) {
  const mail = label === "邮件正文";
  if (typeof html !== "string" || html.length > (mail ? maxMailHtml : 200000)) {
    throw Error(label + "过长或格式错误");
  }
  let text = "";
  const result = sanitize(html, {
    allowedTags: [
      ...(mail ? ["img", "a"] : []),
      "p",
      "br",
      "h1",
      "h2",
      "h3",
      "footer",
      "strong",
      "em",
      "u",
      "s",
      "span",
      "ul",
      "ol",
      "li",
      "blockquote",
      "hr",
    ],
    allowedAttributes: {
      "*": ["style"],
      ol: ["start"],
      img: ["src", "alt", "width", "data-align", "data-radius"],
      a: ["href"],
    },
    allowedSchemes: ["http", "https"],
    allowedSchemesByTag: { img: ["data"] },
    allowProtocolRelative: false,
    transformTags: {
      img: (_, attrs) => ({
        tagName: "img",
        attribs: {
          src: attrs.src,
          alt: (attrs.alt || "图片").slice(0, 120),
          ...imagePresentation(
            attrs.width,
            attrs["data-align"],
            attrs["data-radius"],
          ),
        },
      }),
      a: (_, attrs) =>
        isWebLink(attrs.href)
          ? { tagName: "a", attribs: { href: attrs.href } }
          : { tagName: "span", attribs: {} },
    },
    exclusiveFilter: (frame) =>
      frame.tag === "img" && !isMailImage(frame.attribs.src),
    allowedStyles: {
      img: {
        "max-width": [/^100%$/],
        height: [/^auto$/],
        "border-radius": [/^\d{1,3}px$/],
        display: [/^block$/],
        margin: [/^0 auto$|^0 auto 0 0$|^0 0 0 auto$/],
      },
      "*": {
        "text-align": [/^(left|right|center|justify)$/],
        "font-size": [/^(?:[89]|[1-6]\d|7[0-2])pt$/],
        color: [
          /^#[a-f\d]{6}$/i,
          /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/,
        ],
      },
    },
    textFilter(node) {
      text += node;
      const error = templateError(node, false, true, custom);
      if (error) {
        throw Error(error);
      }
      return values
        ? node.replace(variablePattern, (_, key) =>
            escapeHtml(values[key]).replace(/\r?\n/g, "<br>"),
          )
        : node;
    },
  });
  if (
    !text.replace(/&nbsp;/g, " ").trim() &&
    !(mail && result.includes("<img "))
  ) {
    throw Error("请填写" + label);
  }
  return result;
}
module.exports = { renderRichText };

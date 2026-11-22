import * as stylex from "@stylexjs/stylex";
import { useEffect, useState } from "react";

import { s } from "./styles";

import type { Mail } from "./api";

export const MailPreview = ({ template }: { template: Mail }) => {
  const [preview, setPreview] = useState<{ subject: string; html: string }>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const result = await window.offerFlow.previewMail(template);
        if (active) {
          setPreview(result);
          setError("");
        }
      } catch (cause) {
        if (active) {
          setPreview(undefined);
          setError(String(cause).split("Error: ").pop() || "无法预览模板");
        }
      }
    }, 120);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [template]);
  return (
    <section aria-label="邮件实时预览" {...stylex.props(s.previewPanel)}>
      {preview ? (
        <article {...stylex.props(s.mailPaper)}>
          <h3>{preview.subject}</h3>
          <div dangerouslySetInnerHTML={{ __html: preview.html }} />
        </article>
      ) : (
        <p>{error || "正在生成预览…"}</p>
      )}
    </section>
  );
};

import * as stylex from "@stylexjs/stylex";
import { useEffect, useRef, useState } from "react";
import { Button } from "@lobehub/ui/es/Button/index";
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from "pdfjs-dist";

import { s } from "./styles";

import type { Notice } from "./api";

const LiveNotice = ({ layout }: { layout: Notice }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null),
    [page, setPage] = useState(1);
  const [loadedLayout, setLoadedLayout] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    const worker = new PdfWorker();
    GlobalWorkerOptions.workerPort = worker;
    return () => {
      GlobalWorkerOptions.workerPort = null;
      worker.terminate();
    };
  }, []);
  useEffect(() => {
    let cancelled = false,
      task: ReturnType<typeof getDocument> | undefined;
    const timer = setTimeout(async () => {
      setBusy(true);
      setError("");
      setDoc(null);
      try {
        const bytes = await window.offerFlow.renderPreview(layout);
        if (cancelled) {
          return;
        }
        task = getDocument({
          data: new Uint8Array(bytes),
        });
        const next = await task.promise;
        if (!cancelled) {
          setPage((current) => Math.min(current, next.numPages));
          setLoadedLayout(layout);
          setDoc(next);
        }
      } catch (e) {
        if (!cancelled) {
          setError(String(e).replace(/^.*Error: /, ""));
          setBusy(false);
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (task) {
        void task.destroy();
      }
    };
  }, [layout]);
  useEffect(() => {
    if (!doc) {
      return;
    }
    let cancelled = false,
      task:
        | ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
        | undefined;
    (async () => {
      try {
        const pdfPage = await doc.getPage(page);
        if (cancelled || !canvas.current) {
          return;
        }
        const viewport = pdfPage.getViewport({ scale: 1.5 });
        canvas.current.width = Math.ceil(viewport.width);
        canvas.current.height = Math.ceil(viewport.height);
        task = pdfPage.render({ canvas: canvas.current, viewport });
        await task.promise;
        if (!cancelled) {
          setBusy(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
          setBusy(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page]);
  return (
    <section
      aria-busy={!error && (busy || loadedLayout !== layout)}
      aria-label="实时预览"
      {...stylex.props(s.previewPanel)}
    >
      {error ? (
        <p>{error}</p>
      ) : (
        <canvas
          ref={canvas}
          aria-label="示例通知书 PDF"
          {...stylex.props(s.paper)}
        />
      )}
      {doc && doc.numPages > 1 && (
        <div {...stylex.props(s.row)}>
          <span>
            {page} / {doc.numPages}
          </span>
          <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>
            上一页
          </Button>
          <Button
            disabled={page >= doc.numPages}
            onClick={() => setPage(page + 1)}
          >
            下一页
          </Button>
        </div>
      )}
    </section>
  );
};
export default LiveNotice;

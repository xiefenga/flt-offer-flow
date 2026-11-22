import * as stylex from "@stylexjs/stylex";
import { ScrollArea } from "@lobehub/ui/es/ScrollArea/index";
import { DraggablePanel } from "@lobehub/ui/es/DraggablePanel/index";

import "@lobehub/ui/css/DraggablePanel.css";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { s } from "./styles";

const PaneScroll = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <ScrollArea
    {...stylex.props(s.paneScroll)}
    disableContentFit
    viewportProps={{
      ...stylex.props(s.viewport),
      role: "region",
      "aria-label": label,
      tabIndex: 0,
    }}
  >
    <div {...stylex.props(s.editIsland)}>{children}</div>
  </ScrollArea>
);
export const TemplateSplit = ({
  children,
  preview,
  previewTools,
}: {
  children: ReactNode;
  preview: ReactNode;
  previewTools?: ReactNode;
}) => {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [ratio, setRatio] = useState(0.54);
  useLayoutEffect(() => {
    const el = container.current!;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const min = Math.min(285, width * 0.48);
  const max = Math.max(min, width - 205);
  return (
    <div ref={container} {...stylex.props(s.previewLayout)}>
      <DraggablePanel
        styles={{
          content: { height: "100%", minHeight: 0, overflow: "hidden" },
        }}
        placement="left"
        expandable={false}
        backgroundColor="transparent"
        minWidth={min}
        maxWidth={max}
        size={{ width: Math.max(min, Math.min(max, ratio * width)) }}
        onSizeChange={(_, size) => {
          if (width && typeof size.width === "number") {
            setRatio(size.width / width);
          }
        }}
      >
        <PaneScroll label="模板编辑区">{children}</PaneScroll>
      </DraggablePanel>
      <div {...stylex.props(s.previewColumn)}>
        {previewTools}
        <PaneScroll label="模板预览区">{preview}</PaneScroll>
      </div>
    </div>
  );
};

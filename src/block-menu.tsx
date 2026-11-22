import { Plus } from "lucide-react";
import * as stylex from "@stylexjs/stylex";
import Popover from "@lobehub/ui/es/Popover/index";
import { Input } from "@lobehub/ui/es/Input/index";

import "@lobehub/ui/css/Popover.css";
import { Button } from "@lobehub/ui/es/Button/index";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { s } from "./styles";

import type { Editor } from "@tiptap/core";

export type BlockCommand = {
  id: string;
  label: string;
  group: string;
  run: () => void;
};
export const BlockMenu = ({
  editor,
  commands,
  label = "插入内容块",
}: {
  editor: Editor;
  commands: BlockCommand[];
  label?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [top, setTop] = useState(16);
  const search = useRef<HTMLInputElement>(null);
  const id = useId();
  const options = commands.filter((c) =>
    (c.label + " " + c.group + " " + c.id)
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const changeOpen = (next: boolean) => {
    setOpen(next);
    setQuery("");
    setIndex(0);
  };
  useLayoutEffect(() => {
    const dom = editor.view.dom;
    const update = () => {
      if (editor.isDestroyed || !dom.clientHeight) {
        return;
      }
      const { from } = editor.state.selection;
      const y =
        editor.view.coordsAtPos(from).top - dom.getBoundingClientRect().top;
      setTop(Math.max(2, Math.min(dom.clientHeight - 26, y)));
    };
    const keydown = (e: KeyboardEvent) => {
      if (
        e.key !== "/" ||
        e.isComposing ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      ) {
        return;
      }
      const { empty, $from } = editor.state.selection;
      if (
        !empty ||
        ($from.parentOffset &&
          !/\s$/.test(
            $from.parent.textBetween(
              0,
              $from.parentOffset,
              undefined,
              "\uFFFC",
            ),
          ))
      ) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      update();
      changeOpen(true);
    };
    update();
    editor.on("transaction", update);
    dom.addEventListener("scroll", update);
    dom.addEventListener("keydown", keydown, true);
    const observer = new ResizeObserver(update);
    observer.observe(dom);
    return () => {
      editor.off("transaction", update);
      dom.removeEventListener("scroll", update);
      dom.removeEventListener("keydown", keydown, true);
      observer.disconnect();
    };
  }, [editor]);
  useEffect(() => {
    if (open) {
      document
        .getElementById(id + "-" + index)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [id, index, open, query]);
  const apply = (command: BlockCommand) => {
    changeOpen(false);
    command.run();
  };
  return (
    <div {...stylex.props(s.blockHandle)} style={{ top }}>
      <Popover
        open={open}
        onOpenChange={changeOpen}
        trigger="click"
        placement="bottomLeft"
        popupProps={{ initialFocus: search, finalFocus: false }}
        content={
          <div {...stylex.props(s.commandPanel)}>
            <Input
              ref={search}
              value={query}
              placeholder="搜索命令或变量"
              role="combobox"
              aria-label="搜索命令或变量"
              aria-expanded
              aria-controls={id}
              aria-activedescendant={
                options[index] ? id + "-" + index : undefined
              }
              onChange={(e) => {
                setQuery(e.target.value);
                setIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing || e.keyCode === 229) {
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  changeOpen(false);
                  editor.commands.focus();
                  return;
                }
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  if (options.length) {
                    setIndex(
                      (index +
                        (e.key === "ArrowDown" ? 1 : -1) +
                        options.length) %
                        options.length,
                    );
                  }
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  if (options[index]) {
                    apply(options[index]);
                  }
                }
              }}
            />
            <div
              id={id}
              role="listbox"
              aria-label="编辑命令"
              {...stylex.props(s.commandList)}
            >
              {options.map((command, i) => (
                <div key={command.id}>
                  {options[i - 1]?.group !== command.group && (
                    <div {...stylex.props(s.commandGroup)}>{command.group}</div>
                  )}
                  <Button
                    type="text"
                    role="option"
                    id={id + "-" + i}
                    aria-selected={index === i}
                    tabIndex={-1}
                    {...stylex.props(
                      s.commandItem,
                      index === i && s.commandActive,
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => apply(command)}
                  >
                    {command.label}
                  </Button>
                </div>
              ))}
              {!options.length && (
                <div {...stylex.props(s.commandGroup)}>没有匹配的命令</div>
              )}
            </div>
          </div>
        }
      >
        <Button
          size="small"
          type="text"
          aria-label={label}
          title={label + "（/）"}
          onMouseDown={(e) => e.preventDefault()}
        >
          <Plus size={15} />
        </Button>
      </Popover>
    </div>
  );
};

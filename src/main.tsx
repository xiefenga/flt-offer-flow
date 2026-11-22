import { motion } from "motion/react";
import { zhCn } from "@lobehub/ui/i18n";
import { createRoot } from "react-dom/client";
import { ToastHost } from "@lobehub/ui/es/Toast/index";
import ConfigProvider from "@lobehub/ui/es/ConfigProvider/index";

import "@lobehub/ui/css/Toast.css";
import App from "./app";
import "./overlays.css";
import "./scrollbars.css";

createRoot(document.getElementById("root")!).render(
  <ConfigProvider locale="zh-CN" resources={zhCn} motion={motion}>
    <App />
    <ToastHost position="bottom-right" limit={3} />
  </ConfigProvider>,
);

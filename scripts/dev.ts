import path from "node:path";
import electron from "electron";
import { createServer } from "vite";
import { spawn, type ChildProcess } from "node:child_process";

const server = await createServer({ server: { host: "127.0.0.1" } });
await server.listen();
const origin = server.resolvedUrls!.local[0];
server.printUrls();

let child: ChildProcess | undefined;
let restarting = false;
let closing = false;
let timer: NodeJS.Timeout | undefined;

async function close(code: number) {
  if (closing) {
    return;
  }
  closing = true;
  clearTimeout(timer);
  child?.kill();
  await server.close();
  process.exitCode = code;
}

function launch() {
  restarting = false;
  child = spawn(String(electron), [...process.argv.slice(2), "."], {
    stdio: "inherit",
    env: { ...process.env, OFFER_FLOW_DEV_URL: origin },
  });
  child.once("error", (error) => {
    console.error(error);
    void close(1);
  });
  child.once("exit", (code) => {
    child = undefined;
    if (closing) {
      return;
    }
    if (restarting) {
      launch();
    } else if (code) {
      console.error("Electron 已退出，修改主进程文件后将重新启动。");
    } else {
      void close(0);
    }
  });
}

server.watcher.on("all", (event, file) => {
  if (closing || !["add", "change", "unlink"].includes(event)) {
    return;
  }
  const folder = path.relative(process.cwd(), file).split(path.sep)[0];
  if (!["desktop", "shared", "templates"].includes(folder)) {
    return;
  }
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (child) {
      restarting = true;
      child.kill();
    } else {
      launch();
    }
  }, 100);
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void close(0));
}
launch();

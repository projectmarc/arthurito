import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { readFile } from "node:fs/promises";

const ART_URL = new URL("./arthur.txt", import.meta.url);

export default function (pi: ExtensionAPI): void {
  let generation = 0;
  let clearHeader = () => {};
  const cleanup = () => {
    generation++;
    clearHeader();
    clearHeader = () => {};
  };

  // Invalidate an in-flight file read when the session closes or restarts.
  pi.on("session_shutdown", cleanup);

  pi.on("session_start", async (_event, ctx) => {
    cleanup();
    const current = generation;
    if (ctx.mode !== "tui") return;

    let content: string;
    try {
      content = await readFile(ART_URL, "utf8");
    } catch {
      if (current === generation) ctx.ui.notify("Arthur: could not read arthur.txt", "error");
      return;
    }
    if (current !== generation) return;

    const lines = content.split("\n");
    if (lines.at(-1) === "") lines.pop();
    const artWidth = Math.max(0, ...lines.map((line) => visibleWidth(line)));

    // The project configuration excludes the native banner, so there is no
    // competing header factory and no timing-based takeover.
    ctx.ui.setHeader((_tui, theme) => ({
      render(width: number): string[] {
        if (width <= 0) return [];
        const padding = " ".repeat(Math.max(0, Math.floor((width - artWidth) / 2)));
        return lines.map((line) => theme.fg("accent", truncateToWidth(padding + line, width, "")));
      },
      invalidate() {},
    }));
    clearHeader = () => ctx.ui.setHeader(undefined);
  });
}

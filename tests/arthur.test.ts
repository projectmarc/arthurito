import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createJiti } from "/opt/homebrew/lib/node_modules/gentle-pi/node_modules/jiti/lib/jiti.mjs";

const jiti = createJiti(import.meta.url, {
  alias: {
    "@earendil-works/pi-tui": "/opt/homebrew/lib/node_modules/gentle-pi/node_modules/@earendil-works/pi-tui/dist/index.js",
    "@earendil-works/pi-coding-agent": "/opt/homebrew/lib/node_modules/gentle-pi/node_modules/@earendil-works/pi-coding-agent/dist/index.js",
  },
});

const { visibleWidth } = jiti("@earendil-works/pi-tui");

// Stub harness for ExtensionAPI
interface MockEventHandlers {
  session_start?: Array<(event: any, ctx: any) => Promise<void> | void>;
  session_shutdown?: Array<() => Promise<void> | void>;
}

function createMockPi() {
  const handlers: MockEventHandlers = {
    session_start: [],
    session_shutdown: [],
  };

  const pi = {
    on(event: string, handler: any) {
      if (event === "session_start") {
        handlers.session_start?.push(handler);
      } else if (event === "session_shutdown") {
        handlers.session_shutdown?.push(handler);
      }
      return () => {};
    },
    registerCommand() {},
    getCommands() { return []; },
    getAllTools() { return []; },
  };

  return { pi, handlers };
}

function createMockCtx(
  mode: "tui" | "rpc" | "json" | "print" = "tui",
  theme = { fg: (_token: string, text: string) => text },
) {
  let currentHeaderFactory: any = null;
  let activeComponent: any = null;
  const calls: any[] = [];

  const ui = {
    setHeader(factory: any) {
      calls.push(factory);
      if (activeComponent?.dispose) {
        activeComponent.dispose();
      }
      currentHeaderFactory = factory;
      if (factory) {
        activeComponent = factory(ui, theme);
      } else {
        activeComponent = null;
      }
    },
  };

  const ctx = {
    mode,
    hasUI: mode === "tui" || mode === "rpc",
    cwd: "/mock/cwd",
    ui,
  };

  return {
    ctx,
    get activeComponent() { return activeComponent; },
    get currentHeaderFactory() { return currentHeaderFactory; },
    get calls() { return calls; },
  };
}

test("arthur extension - module exports extension factory", async () => {
  const arthurModule = await jiti.import("../arthur.ts", { default: true });
  assert.equal(typeof arthurModule, "function", "arthur.ts must export a default function");
});

test("arthur extension - guards against non-TUI mode", async () => {
  const arthurExtension = (await jiti.import("../arthur.ts", { default: true })) as any;
  const { pi, handlers } = createMockPi();
  arthurExtension(pi);

  const mock = createMockCtx("rpc");
  for (const h of handlers.session_start || []) {
    await h({ type: "session_start", reason: "startup" }, mock.ctx);
  }

  assert.equal(mock.calls.length, 0, "setHeader must not be called in non-TUI mode");
  assert.equal(mock.activeComponent, null);
});

test("arthur extension - renders Arthur ascii art and preserves braille whitespace", async () => {
  const arthurExtension = (await jiti.import("../arthur.ts", { default: true })) as any;
  const { pi, handlers } = createMockPi();
  arthurExtension(pi);

  const mock = createMockCtx("tui");
  for (const h of handlers.session_start || []) {
    await h({ type: "session_start", reason: "startup" }, mock.ctx);
  }

  assert.ok(mock.activeComponent, "Arthur must be installed before session_start completes, without a takeover timer");
  assert.equal(typeof mock.activeComponent.render, "function");

  // Load raw arthur.txt lines for comparison
  const rawArt = await readFile(join(dirname(fileURLToPath(import.meta.url)), "..", "arthur.txt"), "utf8");
  const rawLines = rawArt.split("\n");
  if (rawLines[rawLines.length - 1] === "") rawLines.pop();

  const artWidth = Math.max(...rawLines.map((l: string) => visibleWidth(l)));
  assert.equal(artWidth, 39, "arthur.txt max width should be 39");

  // Adequate width test (e.g. 80 columns)
  const rendered80 = mock.activeComponent.render(80);
  assert.equal(rendered80.length, rawLines.length, "should render all lines of arthur.txt");

  const pad80 = Math.floor((80 - artWidth) / 2);
  for (let i = 0; i < rawLines.length; i++) {
    // Preserve original art exactly at adequate widths
    assert.equal(rendered80[i], " ".repeat(pad80) + rawLines[i], `Line ${i} must preserve braille art exactly with centering`);
    assert.ok(visibleWidth(rendered80[i]) <= 80, `Line ${i} must not exceed 80 columns`);
  }

  // Narrow width test (e.g. 20 columns) - terminal safe clipping
  const rendered20 = mock.activeComponent.render(20);
  assert.equal(rendered20.length, rawLines.length);
  for (let i = 0; i < rendered20.length; i++) {
    assert.ok(visibleWidth(rendered20[i]) <= 20, `Line ${i} must not exceed 20 columns in narrow mode`);
  }

  // Very narrow width test (e.g. 1 column)
  const rendered1 = mock.activeComponent.render(1);
  for (let i = 0; i < rendered1.length; i++) {
    assert.ok(visibleWidth(rendered1[i]) <= 1, `Line ${i} must not exceed 1 column`);
  }
});

test("arthur extension - uses the active theme accent on every render", async () => {
  const extension = (await jiti.import("../arthur.ts", { default: true })) as any;
  const { pi, handlers } = createMockPi();
  extension(pi);
  let accent = "\x1b[31m";
  const mock = createMockCtx("tui", {
    fg(token: string, text: string) {
      assert.equal(token, "accent");
      return `${accent}${text}\x1b[39m`;
    },
  });
  for (const handler of handlers.session_start || []) await handler({}, mock.ctx);
  const raw = (await readFile(new URL("../arthur.txt", import.meta.url), "utf8")).trimEnd().split("\n");
  assert.deepEqual(mock.activeComponent.render(39), raw.map((line) => `\x1b[31m${line}\x1b[39m`));
  accent = "\x1b[32m";
  mock.activeComponent.invalidate();
  assert.deepEqual(mock.activeComponent.render(39), raw.map((line) => `\x1b[32m${line}\x1b[39m`));
  assert.ok(mock.activeComponent.render(20).every((line: string) => visibleWidth(line) <= 20));
});

test("arthur extension - shutdown removes its installed header", async () => {
  const arthurExtension = (await jiti.import("../arthur.ts", { default: true })) as any;
  const { pi, handlers } = createMockPi();
  arthurExtension(pi);

  const mock = createMockCtx("tui");
  for (const h of handlers.session_start || []) {
    await h({ type: "session_start", reason: "startup" }, mock.ctx);
  }

  assert.ok(mock.activeComponent, "header must be installed before shutdown");

  // Shutdown disposes the installed header.
  for (const h of handlers.session_shutdown || []) {
    await h();
  }

  assert.equal(mock.activeComponent, null, "shutdown must remove the header");
});

test("arthur extension - takes over an existing header and disposes it", async () => {
  const arthurExtension = (await jiti.import("../arthur.ts", { default: true })) as any;
  const { pi, handlers } = createMockPi();
  arthurExtension(pi);

  const mock = createMockCtx("tui");

  // Header replacement still disposes any previously installed component.
  let nativeBannerDisposed = false;
  {
    mock.ctx.ui.setHeader((_tui: any, _theme: any) => ({
      render: () => ["native banner"],
      invalidate() {},
      dispose() {
        nativeBannerDisposed = true;
      },
    }));
  }

  // User extension session_start runs
  for (const h of handlers.session_start || []) {
    await h({ type: "session_start", reason: "startup" }, mock.ctx);
  }

  // Replacement is complete when the session handler resolves.
  assert.equal(nativeBannerDisposed, true, "native banner should be disposed when Arthur takes over");
  assert.notDeepEqual(mock.activeComponent?.render(80), ["native banner"]);
});


test("real Pi resolver excludes only the native banner and enables Arthur", async () => {
  const host = "/opt/homebrew/lib/node_modules/gentle-pi";
  const { DefaultPackageManager } = await import(`${host}/node_modules/@earendil-works/pi-coding-agent/dist/core/package-manager.js`);
  const { SettingsManager, InMemorySettingsStorage } = await import(`${host}/node_modules/@earendil-works/pi-coding-agent/dist/core/settings-manager.js`);
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const native = join(host, "extensions/startup-banner.ts");
  const globalSettings = JSON.stringify({ packages: [host] });
  const resolveResources = async (project: string) => {
    const storage = new InMemorySettingsStorage();
    storage.withLock("global", () => JSON.stringify({ ...JSON.parse(globalSettings), ...JSON.parse(project) }));
    const settingsManager = SettingsManager.fromStorage(storage, { projectTrusted: true });
    return new DefaultPackageManager({ cwd: root, agentDir: join(root, ".pi"), settingsManager }).resolve(() => Promise.resolve("error"));
  };
  const before = await resolveResources("{}");
  assert.ok(before.extensions.some((r: any) => r.path === native && r.enabled), "reproduction: the host normally loads its native banner");
  const project = await readFile(join(root, "settings.example.json"), "utf8");
  const { findGentlePiDeclaration } = jiti(`${host}/lib/gentle-shell-launcher.ts`);
  assert.deepEqual(findGentlePiDeclaration(project, {
    agentDir: join(root, ".pi"),
    readPackageName: (path: string) => path === host ? "gentle-pi" : "arthurito",
  }), { kind: "path", dir: host }, "the launcher must recognize the package declaration and not inject its unfiltered native banner");
  const after = await resolveResources(project);
  const enabled = after.extensions.filter((r: any) => r.enabled).map((r: any) => r.path);
  assert.ok(!enabled.includes(native), "native banner must not load, regardless of timing");
  assert.ok(enabled.includes(join(root, "arthur.ts")), "Arthur must load through package settings");
  const originalOther = before.extensions.filter((r: any) => r.enabled && r.path !== native).map((r: any) => r.path).sort();
  assert.deepEqual(enabled.filter((p: string) => p !== join(root, "arthur.ts")).sort(), originalOther, "every other host extension must remain enabled");
});

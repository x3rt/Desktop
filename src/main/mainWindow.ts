/*
 * SPDX-License-Identifier: GPL-3.0
 * Vencord Desktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2023 Vendicated and Vencord contributors
 */

import { app, BrowserWindow, BrowserWindowConstructorOptions, Menu, Tray } from "electron";
import { join } from "path";

import { ICON_PATH } from "../shared/paths";
import { createAboutWindow } from "./about";
import { DEFAULT_HEIGHT, DEFAULT_WIDTH, MIN_HEIGHT, MIN_WIDTH } from "./constants";
import { Settings, VencordSettings } from "./settings";
import { makeLinksOpenExternally } from "./utils/makeLinksOpenExternally";
import { downloadVencordFiles } from "./utils/vencordLoader";

let isQuitting = false;
let tray: Tray;

app.on("before-quit", () => {
    isQuitting = true;
});

export let mainWin: BrowserWindow;

function initTray(win: BrowserWindow) {
    const trayMenu = Menu.buildFromTemplate([
        {
            label: "Open",
            click() {
                win.show();
            },
            enabled: false
        },
        {
            label: "About",
            click: createAboutWindow
        },
        {
            label: "Update Vencord",
            async click() {
                await downloadVencordFiles();
                app.relaunch();
                app.quit();
            }
        },
        {
            type: "separator"
        },
        {
            label: "Relaunch",
            click() {
                app.relaunch();
                app.quit();
            }
        },
        {
            label: "Quit Vencord Desktop",
            click() {
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray = new Tray(ICON_PATH);
    tray.setToolTip("Vencord Desktop");
    tray.setContextMenu(trayMenu);
    tray.on("click", () => win.show());

    win.on("show", () => {
        trayMenu.items[0].enabled = false;
    });

    win.on("hide", () => {
        trayMenu.items[0].enabled = true;
    });
}

function initMenuBar(win: BrowserWindow) {
    const isWindows = process.platform === "win32";
    const wantCtrlQ = !isWindows || VencordSettings.store.winCtrlQ;

    const menu = Menu.buildFromTemplate([
        {
            label: "Vencord Desktop",
            role: "appMenu",
            submenu: [
                {
                    label: "About Vencord Desktop",
                    click: createAboutWindow
                },
                {
                    label: "Force Update Vencord",
                    async click() {
                        await downloadVencordFiles();
                        app.relaunch();
                        app.quit();
                    },
                    toolTip: "Vencord Desktop will automatically restart after this operation"
                },
                {
                    label: "Relaunch",
                    accelerator: "CmdOrCtrl+Shift+R",
                    click() {
                        app.relaunch();
                        app.quit();
                    }
                },
                {
                    label: "Quit",
                    accelerator: wantCtrlQ ? "CmdOrCtrl+Q" : void 0,
                    visible: !isWindows,
                    role: "quit",
                    click() {
                        app.quit();
                    }
                },
                {
                    label: "Quit",
                    accelerator: isWindows ? "Alt+F4" : void 0,
                    visible: isWindows,
                    role: "quit",
                    click() {
                        app.quit();
                    }
                },
                // See https://github.com/electron/electron/issues/14742 and https://github.com/electron/electron/issues/5256
                {
                    label: "Zoom in (hidden, hack for Qwertz and others)",
                    accelerator: "CmdOrCtrl+=",
                    role: "zoomIn",
                    visible: false
                },
                {
                    label: "Quit",
                    accelerator: "CmdOrCtrl+Q",
                    click: () => app.quit(),
                    visible: false
                },
                // Quick Switcher keybindings (Ctrl + T, Ctrl + K)
                {
                    label: "Quick Switcher",
                    accelerator: "CmdOrCtrl+T",
                    click: async () => {
                        // TODO: Check for layers
                        // TODO: Don't use executeJavaScript

                        await win.webContents.executeJavaScript(
                            "Vencord.Webpack.findByCode('type:\"QUICKSWITCHER_SHOW\"')();"
                        );
                    }
                }
            ]
        },
        { role: "fileMenu" },
        { role: "editMenu" },
        { role: "viewMenu" },
        { role: "windowMenu" }
    ]);

    Menu.setApplicationMenu(menu);
}

function getWindowBoundsOptions(): BrowserWindowConstructorOptions {
    const { x, y, width, height } = Settings.store.windowBounds ?? {};

    const options = {
        width: width ?? DEFAULT_WIDTH,
        height: height ?? DEFAULT_HEIGHT
    } as BrowserWindowConstructorOptions;

    if (x != null && y != null) {
        options.x = x;
        options.y = y;
    }

    if (!Settings.store.disableMinSize) {
        options.minWidth = MIN_WIDTH;
        options.minHeight = MIN_HEIGHT;
    }

    return options;
}

function initWindowBoundsListeners(win: BrowserWindow) {
    const saveState = () => {
        Settings.store.maximized = win.isMaximized();
        Settings.store.minimized = win.isMinimized();
    };

    win.on("maximize", saveState);
    win.on("minimize", saveState);
    win.on("unmaximize", saveState);

    const saveBounds = () => {
        Settings.store.windowBounds = win.getBounds();
    };

    win.on("resize", saveBounds);
    win.on("move", saveBounds);
}

function initSettingsListeners(win: BrowserWindow) {
    Settings.addChangeListener("tray", enable => {
        if (enable) initTray(win);
        else tray?.destroy();
    });
    Settings.addChangeListener("disableMinSize", disable => {
        if (disable) {
            // 0 no work
            win.setMinimumSize(1, 1);
        } else {
            win.setMinimumSize(MIN_WIDTH, MIN_HEIGHT);

            const { width, height } = win.getBounds();
            win.setBounds({
                width: Math.max(width, MIN_WIDTH),
                height: Math.max(height, MIN_HEIGHT)
            });
        }
    });

    VencordSettings.addChangeListener("macosTranslucency", enabled => {
        if (enabled) {
            win.setVibrancy("sidebar");
            win.setBackgroundColor("#ffffff00");
        } else {
            win.setVibrancy(null);
            win.setBackgroundColor("#ffffff");
        }
    });
}

export function createMainWindow() {
    const win = (mainWin = new BrowserWindow({
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            sandbox: false,
            contextIsolation: true,
            devTools: true,
            preload: join(__dirname, "preload.js")
        },
        icon: ICON_PATH,
        frame: VencordSettings.store.frameless !== true,
        ...(Settings.store.staticTitle ? { title: "Vencord" } : {}),
        ...(VencordSettings.store.macosTranslucency
            ? {
                  vibrancy: "sidebar",
                  backgroundColor: "#ffffff00"
              }
            : {}),
        ...getWindowBoundsOptions()
    }));

    win.on("close", e => {
        if (isQuitting || Settings.store.minimizeToTray === false || Settings.store.tray === false) return;

        e.preventDefault();
        win.hide();

        return false;
    });

    if (Settings.store.staticTitle) win.on("page-title-updated", e => e.preventDefault());

    initWindowBoundsListeners(win);
    if (Settings.store.tray ?? true) initTray(win);
    initMenuBar(win);
    makeLinksOpenExternally(win);
    initSettingsListeners(win);

    win.webContents.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/111.0.0.0 Safari/537.36"
    );

    const subdomain =
        Settings.store.discordBranch === "canary" || Settings.store.discordBranch === "ptb"
            ? `${Settings.store.discordBranch}.`
            : "";

    win.loadURL(`https://${subdomain}discord.com/app`);

    return win;
}

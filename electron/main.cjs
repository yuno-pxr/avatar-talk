const { app, BrowserWindow, ipcMain, clipboard, dialog, Tray, Menu, globalShortcut, nativeImage, protocol } = require('electron');
const path = require('path');
const dataManager = require('./dataManager.cjs');
const skinManager = require('./skinManager.cjs');

// Register Privileged Schemes for Avatar Protocol (Must be done before app.ready)
protocol.registerSchemesAsPrivileged([
    { scheme: 'avatar', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);

let lastClipboardText = '';
let clipboardInterval = null;
let tray = null;

function startClipboardWatcher(win) {
    console.log('Starting clipboard watcher...');
    if (clipboardInterval) clearInterval(clipboardInterval);

    lastClipboardText = clipboard.readText();

    clipboardInterval = setInterval(() => {
        let text = clipboard.readText();

        // If no text, check for files (URI list)
        // We prioritize text because browsers often put the URL in text/uri-list too.
        if (!text) {
            const uriList = clipboard.read('text/uri-list');
            if (uriList) {
                // Decode URI list to file paths
                // Usually format is "file:///path/to/file\r\n"
                try {
                    const decoded = decodeURIComponent(uriList);
                    // Extract first file path for simplicity, or join them
                    const match = decoded.match(/file:\/\/\/(.+)/);
                    if (match && match[1]) {
                        text = match[1].replace(/\r\n$/, '');
                    }
                } catch (e) {
                    console.error('Error decoding URI list:', e);
                }
            }
        }

        if (text && text !== lastClipboardText) {
            console.log('Clipboard changed:', text.substring(0, 20) + '...');
            lastClipboardText = text;

            const newItem = dataManager.addHistoryItem({
                type: 'clipboard',
                content: text,
                originalContent: text
            });

            if (win && !win.isDestroyed()) {
                console.log('Sending clipboard-updated to renderer');
                win.webContents.send('clipboard-updated', newItem);
            }
        }
    }, 1000);
}

let mainWindow = null;
let avatarWindow = null;
let isQuitting = false;

// Disable GPU Acceleration for compatibility (keep existing)
app.disableHardwareAcceleration();

// --- Avatar Window ---
function createAvatarWindow() {
    console.log('Creating avatar window...');
    const preloadPath = path.join(__dirname, 'preload.cjs');

    avatarWindow = new BrowserWindow({
        width: 100,
        height: 100,
        minWidth: 1,
        minHeight: 1,
        useContentSize: true,
        transparent: true,
        frame: false,
        hasShadow: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        transparent: true, // Restore transparency
        // backgroundColor: '#1a1a1a', // Removed opaque background
        resizable: false, // Prevent user resizing (we control it via code)
        maximizable: false, // Prevent maximizing
        // type: 'toolbar', // Removed as it may cause input issues
        webPreferences: {
            preload: preloadPath,
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false,
            webSecurity: false // Allow loading local files (file://) from http://localhost
        }
    });

    // Load same app but with identifying query param
    const isDev = !app.isPackaged;
    const searchParam = '?mode=avatar';

    if (isDev) {
        avatarWindow.loadURL(`http://localhost:5173${searchParam}`);
        // avatarWindow.webContents.openDevTools({ mode: 'detach' }); 
    } else {
        const { pathToFileURL } = require('url');
        const indexPath = path.join(__dirname, '../dist/index.html');
        const fileUrl = pathToFileURL(indexPath).href;
        avatarWindow.loadURL(`${fileUrl}?mode=avatar`);
    }

    avatarWindow.setMenu(null); // Disable default menu

    // Windows Hack: Force toggle to clear "click-through" state consistently
    avatarWindow.setIgnoreMouseEvents(true, { forward: true });
    avatarWindow.setIgnoreMouseEvents(true, { forward: true });
    avatarWindow.setIgnoreMouseEvents(false);

    avatarWindow.webContents.on('render-process-gone', (event, details) => {
        console.error('Avatar Window Crash:', details.reason, 'Exit Code:', details.exitCode);
        // Optional: Dialog or Toast to main window?
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('log', `Avatar Window Crashed: ${details.reason} (Code: ${details.exitCode})`);
        }
    });

    avatarWindow.on('closed', () => {
        avatarWindow = null;
    });
}

// IPC: Receive update from Main Window, forward to Avatar Window
let cachedAvatarState = null;

ipcMain.on('update-avatar-state', (event, state) => {
    cachedAvatarState = state; // Cache for new windows
    if (avatarWindow && !avatarWindow.isDestroyed()) {
        avatarWindow.webContents.send('avatar-state-updated', state);
        if (state.alwaysOnTop !== undefined) {
            avatarWindow.setAlwaysOnTop(state.alwaysOnTop, 'screen-saver');
        }
    }
});

ipcMain.handle('get-avatar-state', () => cachedAvatarState);

ipcMain.on('resize-avatar-window', (event, { width, height }) => {
    if (avatarWindow && !avatarWindow.isDestroyed()) {
        try {
            avatarWindow.setMinimumSize(1, 1); // Ensure constraint allows shrinking
            avatarWindow.setContentSize(Math.ceil(width), Math.ceil(height));
        } catch (e) {
            console.error('Resize failed:', e);
        }
    }
});

// Missing handler for window movement
ipcMain.on('move-avatar-window', (event, { dx, dy }) => {
    if (avatarWindow && !avatarWindow.isDestroyed()) {
        const [x, y] = avatarWindow.getPosition();
        avatarWindow.setPosition(Math.round(x + dx), Math.round(y + dy));
    }
});

// IPC: Allow Avatar Window to control its own ignoreMouseEvents if needed
// IPC: Allow Avatar Window to control its own ignoreMouseEvents if needed
ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
        if (ignore) {
            // Forward: true allows "click-through" (events go to OS)
            win.setIgnoreMouseEvents(true, { forward: true });
        } else {
            // Disable ignore means "Capture Events".
            // Windows Hack: Force toggle to clear "click-through" state consistently
            win.setIgnoreMouseEvents(true, { forward: true });
            win.setIgnoreMouseEvents(false);
        }
    }
});

// Generic Log Handler
ipcMain.on('log', (event, message) => {
    console.log('[Renderer Log]', message);
    if (mainWindow && !mainWindow.isDestroyed() && event.sender !== mainWindow.webContents) {
        // Forward to main window if it came from elsewhere
        mainWindow.webContents.send('log', message);
    }
});
ipcMain.on('sync-avatar-scale', (event, scale) => {
    // Only forward to Main Window
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('avatar-scale-sync', scale);
    }
    // Also update cache so new windows get correct scale
    if (cachedAvatarState) {
        cachedAvatarState.scale = scale;
    }
});

function createTray() {
    const iconPath = path.join(__dirname, 'icon.png');
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon);
    tray.setToolTip('Monolith Widget');

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show', click: () => {
                if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Quit', click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
                mainWindow.focus();
            }
        }
    });
}

function registerGlobalShortcut() {
    // User requested "win+shift+a".
    // On Windows, 'Super' is the Windows key.
    const shortcut = 'Super+Shift+A';

    // Unregister first just in case
    globalShortcut.unregisterAll();

    const ret = globalShortcut.register(shortcut, () => {
        console.log('Global shortcut activated');
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
            // Send event to renderer to focus input
            mainWindow.webContents.send('focus-input');
        }
    });

    if (!ret) {
        console.log('Registration failed for:', shortcut);
    } else {
        console.log('Global shortcut registered:', shortcut);
    }
}

function createWindow() {
    console.log('Creating window...');
    const preloadPath = path.join(__dirname, 'preload.cjs');
    console.log('Preload path:', preloadPath);

    mainWindow = new BrowserWindow({
        width: 400,
        height: 600,
        minWidth: 400,
        minHeight: 600,
        resizable: true,
        frame: false,
        transparent: false,
        backgroundColor: '#1a1a1a',
        alwaysOnTop: false,
        center: true, // Force center
        skipTaskbar: false, // Show in taskbar when visible
        webPreferences: {
            preload: preloadPath,
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false, // Allow background processing (e.g. voice recognition)
            webSecurity: false // Allow loading local files
        },
    });

    mainWindow.setMenu(null); // Disable default menu

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.focus(); // Force focus
    });

    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
            return false;
        }
    });

    const isDev = !app.isPackaged;
    console.log('Is Dev:', isDev);

    if (isDev) {
        console.log('Loading URL: http://localhost:5173');
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools({ mode: 'detach' }); // Open DevTools
    } else {
        console.log('Loading file:', path.join(__dirname, '../dist/index.html'));
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }

    // Check settings before starting clipboard watcher
    const settings = dataManager.getSettings();
    if (settings.isClipboardEnabled !== false) { // Default to true if undefined
        startClipboardWatcher(mainWindow);
    }
}

ipcMain.handle('get-history', () => {
    console.log('IPC: get-history');
    return dataManager.getHistory();
});

ipcMain.handle('add-history', (event, item) => {
    console.log('IPC: add-history', item);
    return dataManager.addHistoryItem(item);
});

ipcMain.handle('get-settings', () => {
    console.log('IPC: get-settings');
    return dataManager.getSettings();
});

ipcMain.handle('save-settings', (event, settings) => {
    console.log('IPC: save-settings');
    dataManager.saveSettings(settings);

    // Broadcast to all windows
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('settings-updated', settings);
    }
    if (avatarWindow && !avatarWindow.isDestroyed()) {
        avatarWindow.webContents.send('settings-updated', settings);
    }
    return;
});

ipcMain.handle('clear-history', async () => {
    console.log('IPC: clear-history');
    dataManager.clearHistory();
    return [];
});

ipcMain.handle('toggle-clipboard', async (event, shouldWatch) => {
    console.log('IPC: toggle-clipboard', shouldWatch);
    if (shouldWatch) {
        startClipboardWatcher(mainWindow);
    } else {
        if (clipboardInterval) {
            clearInterval(clipboardInterval);
            clipboardInterval = null;
        }
    }
    return shouldWatch;
});

ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (result.canceled) return null;
    return result.filePaths[0];
});

ipcMain.handle('set-log-directory', (event, path) => {
    try {
        dataManager.setLogDirectory(path);
        return true;
    } catch (e) {
        console.error('Failed to set log directory:', e);
        return false;
    }
});

ipcMain.handle('get-log-directory', () => {
    return dataManager.getLogDirectory();
});

ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

ipcMain.handle('get-startup-status', () => {
    return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle('toggle-startup', (event, enable) => {
    app.setLoginItemSettings({
        openAtLogin: enable,
        path: app.getPath('exe') // Explicitly set path for safety
    });
    return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle('get-available-skins', () => {
    return skinManager.getAvailableSkins();
});

ipcMain.handle('load-skin', (event, skinId) => {
    return skinManager.loadSkin(skinId);
});

ipcMain.handle('fetch-url-metadata', async (event, url) => {
    try {
        console.log('Fetching metadata for:', url);
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const html = await response.text();

        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : '';

        const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
            html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["'][^>]*>/i);
        const description = descMatch ? descMatch[1].trim() : '';

        return { title, description };
    } catch (error) {
        console.error('Error fetching metadata:', error);
        return { title: '', description: '' };
    }
});

ipcMain.on('minimize-window', () => {
    if (mainWindow) mainWindow.hide(); // Minimize to tray
});

ipcMain.on('close-window', () => {
    if (mainWindow) mainWindow.hide(); // Close to tray
});

ipcMain.on('log', (event, message) => {
    console.log('[Renderer]:', message);
});

// --- Avatar Handling ---
const AdmZip = require('adm-zip');
const fs = require('fs');

const AVATAR_CACHE_DIR = path.join(app.getPath('userData'), 'avatar_cache');

ipcMain.handle('select-file', async (event, options) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        ...options
    });
    if (result.canceled) return null;
    return result.filePaths[0];
});

// Ukagaka Import Handler
const UkagakaPackageLoader = require('./ukagaka/UkagakaPackageLoader.cjs');
const UkagakaAvatarAdapter = require('./ukagaka/UkagakaAvatarAdapter.cjs');

ipcMain.handle('install-ukagaka-ghost', async (event) => {
    try {
        console.log('[IPC] install-ukagaka-ghost triggered');
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [
                { name: 'Ukagaka Ghost Package', extensions: ['nar', 'zip'] }
            ]
        });

        if (result.canceled || result.filePaths.length === 0) {
            return null; // Canceled
        }

        const filePath = result.filePaths[0];
        console.log('[IPC] Selected Ukagaka Package:', filePath);

        // 1. Load Package
        const loader = new UkagakaPackageLoader(filePath);
        const packageInfo = await loader.load();

        if (!packageInfo || (!packageInfo.hasShell && packageInfo.shellDirs.length === 0)) {
            throw new Error('No valid shell found in the package.');
        }

        // Use the first detected shell directory
        const shellDir = packageInfo.shellDirs[0];
        console.log('[IPC] Using shell directory:', shellDir);

        // 2. Convert and Install
        // We use the default avatar cache directory
        const adapter = new UkagakaAvatarAdapter(AVATAR_CACHE_DIR);
        // Pass extractPath (from loader) and shellDir
        // Note: shellDir is absolute path from loader analysis, so it works directly
        const avatarId = await adapter.convertAndInstall(loader.extractPath, shellDir);

        console.log('[IPC] Ukagaka Ghost installed successfully:', avatarId);
        return avatarId;

    } catch (e) {
        console.error('[IPC] Failed to install Ukagaka ghost:', e);
        throw e;
    }
});

// VRM Import Handler
ipcMain.handle('install-vrm', async (event) => {
    try {
        console.log('[IPC] install-vrm triggered');
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [
                { name: 'VRM Model', extensions: ['vrm'] }
            ]
        });

        if (result.canceled || result.filePaths.length === 0) return null;

        const filePath = result.filePaths[0];
        const fileName = path.basename(filePath);
        // Use timestamp to assume uniqueness
        const avatarId = `vrm-${Date.now()}`;
        const targetDir = path.join(AVATAR_CACHE_DIR, avatarId);

        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        // Copy VRM file
        const targetVrmPath = path.join(targetDir, fileName);
        fs.copyFileSync(filePath, targetVrmPath);

        // Generate model.json
        const modelData = {
            type: "VRM",
            name: fileName.replace('.vrm', ''),
            vrmFile: fileName,
            meta: {
                description: "Imported VRM Model"
            }
        };
        fs.writeFileSync(path.join(targetDir, 'model.json'), JSON.stringify(modelData, null, 2));

        console.log('[IPC] VRM installed:', avatarId);
        return avatarId;

    } catch (e) {
        console.error('[IPC] Failed to install VRM:', e);
        throw e;
    }
});

ipcMain.handle('ukagaka-get-costumes', async (event, avatarId) => {
    try {
        if (!avatarId) throw new Error('No avatar ID provided');
        const safeId = path.basename(avatarId);
        const avatarDir = path.join(AVATAR_CACHE_DIR, safeId);
        const modelPath = path.join(avatarDir, 'model.json');

        if (!fs.existsSync(modelPath)) {
            throw new Error(`Avatar not found: ${avatarId}`);
        }

        const modelData = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
        // Return costumes list or empty
        return modelData.meta && modelData.meta.costumes ? modelData.meta.costumes : [];
    } catch (e) {
        console.error('Failed to get costumes:', e);
        throw e;
    }
});

ipcMain.handle('ukagaka-set-costume', async (event, avatarId, enabledBindIds) => {
    try {
        console.log(`[IPC] ukagaka-set-costume: ${avatarId} -> ${enabledBindIds}`);
        if (!avatarId) throw new Error('No avatar ID provided');
        const safeId = path.basename(avatarId);
        const avatarDir = path.join(AVATAR_CACHE_DIR, safeId);

        // Recompose
        // We reuse the adapter class (it's stateless mostly, except internal require)
        // Check if we need to instantiate it
        const adapter = new UkagakaAvatarAdapter(AVATAR_CACHE_DIR);
        await adapter.recompose(avatarDir, enabledBindIds);

        // Return success
        return true;
    } catch (e) {
        console.error('Failed to set costume:', e);
        throw e;
    }
});



ipcMain.on('show-costume-menu', (event, avatarId, currentBinds, cameraControlEnabled) => {
    // 1. Load Costumes
    try {
        if (!avatarId) return;

        // Ensure currentBinds is array
        if (!Array.isArray(currentBinds)) currentBinds = [];

        const safeId = path.basename(avatarId);
        const avatarDir = path.join(AVATAR_CACHE_DIR, safeId);
        const modelPath = path.join(avatarDir, 'model.json');

        let costumes = [];
        if (fs.existsSync(modelPath)) {
            const modelData = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
            costumes = modelData.meta && modelData.meta.costumes ? modelData.meta.costumes : [];
        }


        // Group by category (heuristic)
        // Strategy: Look for prefix in name (e.g. "靴, 赤", "靴下/白")
        // Japanese specific: "カテゴリ,名前" is common
        const groups = {};
        const ungrouped = [];

        costumes.forEach(c => {
            let groupName = 'Other';
            // Try splitting by comma, slash, or space (if it looks like "Category Name")
            const separators = [',', '/', ' '];
            let foundSep = false;

            for (const sep of separators) {
                if (c.name.includes(sep)) {
                    const parts = c.name.split(sep);
                    if (parts.length > 1) {
                        groupName = parts[0].trim();
                        // If name matches group (e.g. "Ribbon, Red"), removing group from label might is nice but optional.
                        // label: parts.slice(1).join(sep).trim() // Keep full name for clarity in submenu?
                    }
                    foundSep = true;
                    break;
                }
            }

            if (!foundSep) {
                // Try to match prefix if multiple items start with same string?
                // Too complex for now. Just put in "Other" or root?
                // Let's put in 'Misc' or Root.
                groupName = 'Misc';
            }

            if (!groups[groupName]) groups[groupName] = [];
            groups[groupName].push(c);
        });

        // Build Template
        const template = [];

        // Helper to apply binds
        const applyBinds = async (newBinds) => {
            try {
                const win = BrowserWindow.fromWebContents(event.sender);
                const adapter = new UkagakaAvatarAdapter(AVATAR_CACHE_DIR);
                await adapter.recompose(avatarDir, newBinds);
                if (win) {
                    win.webContents.send('avatar-costume-changed', newBinds);
                    // Force image reload
                    win.webContents.send('reload-avatar-image');
                }
            } catch (e) { console.error(e); }
        };

        // --- Camera Control Option ---
        template.push({
            label: 'Camera Control',
            type: 'checkbox',
            checked: !!cameraControlEnabled,
            click: () => {
                event.sender.send('toggle-camera-control');
            }
        });

        // --- Costume Options ---
        if (costumes.length > 0) {
            template.push({ type: 'separator' });
            template.push({ label: 'Costumes', enabled: false });
            template.push({
                label: 'Reset to Defaults',
                click: async () => {
                    const defaults = costumes.filter(c => c.default).map(c => c.id);
                    await applyBinds(defaults);
                }
            });
            template.push({
                label: 'Deselect All (Naked)',
                click: async () => {
                    await applyBinds([]);
                }
            });
            template.push({ type: 'separator' });

            // Build Groups
            // Sort groups: Misc last
            const sortedKeys = Object.keys(groups).sort((a, b) => {
                if (a === 'Misc') return 1;
                if (b === 'Misc') return -1;
                return a.localeCompare(b);
            });

            sortedKeys.forEach(groupName => {
                const items = groups[groupName];

                // Submenu items
                const submenu = [];

                // Helper for group batch action
                const getGroupIds = () => items.map(c => c.id);

                submenu.push({
                    label: 'Select All',
                    click: async () => {
                        const groupIds = getGroupIds();
                        // Add all group IDs to current
                        const newBinds = [...new Set([...currentBinds, ...groupIds])];
                        await applyBinds(newBinds);
                    }
                });
                submenu.push({
                    label: 'Deselect All',
                    click: async () => {
                        const groupIds = getGroupIds();
                        // Remove all group IDs
                        const newBinds = currentBinds.filter(id => !groupIds.includes(id));
                        await applyBinds(newBinds);
                    }
                });
                submenu.push({ type: 'separator' });

                items.forEach(c => {
                    submenu.push({
                        label: c.name,
                        type: 'checkbox',
                        checked: currentBinds.includes(c.id),
                        click: async () => {
                            let newBinds = [...currentBinds];
                            if (newBinds.includes(c.id)) {
                                newBinds = newBinds.filter(id => id !== c.id);
                            } else {
                                newBinds.push(c.id);
                            }
                            await applyBinds(newBinds);
                        }
                    });
                });

                template.push({
                    label: groupName,
                    submenu: submenu
                });
            });
        } // Close if (costumes.length > 0)

        const menu = Menu.buildFromTemplate(template);
        // Show Context Menu
        // We use the BrowserWindow to popup
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) menu.popup({ window: win });

    } catch (e) {
        console.error('Failed to show costume menu:', e);
    }
});

// Existing load-avatar handler...
ipcMain.handle('load-avatar', async (event, filePath) => {
    try {
        console.log('Loading avatar from:', filePath);

        // Ensure cache dir exists
        if (!fs.existsSync(AVATAR_CACHE_DIR)) {
            fs.mkdirSync(AVATAR_CACHE_DIR, { recursive: true });
        }

        // Use filename (without extension) as ID
        const filename = path.basename(filePath, path.extname(filePath));
        // Simple slugify: lowercase, replace spaces with hyphens, remove non-alphanumeric
        const avatarId = filename.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

        const avatarDir = path.join(AVATAR_CACHE_DIR, avatarId);

        // If exists, remove first (to allow update)
        try {
            if (fs.existsSync(avatarDir)) {
                fs.rmSync(avatarDir, { recursive: true, force: true });
            }
        } catch (e) {
            console.warn('Failed to clean existing avatar dir:', e);
        }

        fs.mkdirSync(avatarDir, { recursive: true });

        const zip = new AdmZip(filePath);
        zip.extractAllTo(avatarDir, true);

        // Read model.json
        const modelPath = path.join(avatarDir, 'model.json');
        if (!fs.existsSync(modelPath)) {
            throw new Error('Invalid Avatar: model.json not found');
        }

        const modelData = JSON.parse(fs.readFileSync(modelPath, 'utf8'));

        // Return avatarId and model data
        return { avatarId, modelData };
    } catch (e) {
        console.error('Failed to load avatar:', e);
        throw e;
    }
});

ipcMain.handle('get-installed-avatars', async () => {
    try {
        if (!fs.existsSync(AVATAR_CACHE_DIR)) return [];

        const entries = fs.readdirSync(AVATAR_CACHE_DIR, { withFileTypes: true });
        const avatars = [];

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const modelPath = path.join(AVATAR_CACHE_DIR, entry.name, 'model.json');
                if (fs.existsSync(modelPath)) {
                    try {
                        const modelData = JSON.parse(fs.readFileSync(modelPath, 'utf8'));

                        // Infer Type
                        let type = modelData.type || 'EMG'; // Default to EMG
                        if (!modelData.type) {
                            if (modelData.home_url || modelData.readme || entry.name.startsWith('ukagaka-')) {
                                type = 'Ukagaka';
                            } else if (modelData.vrmFile) {
                                type = 'VRM';
                            }
                        }

                        avatars.push({
                            id: entry.name,
                            name: modelData.name || entry.name,
                            type: type, // Return type
                            path: modelPath
                        });
                    } catch (e) {
                        // Ignore invalid JSON
                    }
                }
            }
        }
        return avatars;
    } catch (e) {
        console.error('Failed to get installed avatars:', e);
        return [];
    }
});

ipcMain.handle('delete-avatar', async (event, avatarId) => {
    try {
        if (!avatarId) throw new Error('No avatar ID provided');

        // Prevent directory traversal (basic check)
        const safeId = path.basename(avatarId);
        const avatarDir = path.join(AVATAR_CACHE_DIR, safeId);

        if (fs.existsSync(avatarDir)) {
            fs.rmSync(avatarDir, { recursive: true, force: true });
            return true;
        }
        return false;
    } catch (e) {
        console.error('Failed to delete avatar:', e);
        throw e;
    }
});

ipcMain.handle('load-installed-avatar', async (event, avatarId) => {
    try {
        if (!avatarId) throw new Error('No avatar ID provided');

        const safeId = path.basename(avatarId);
        const avatarDir = path.join(AVATAR_CACHE_DIR, safeId);
        const modelPath = path.join(avatarDir, 'model.json');

        if (!fs.existsSync(modelPath)) {
            throw new Error(`Avatar not found: ${avatarId}`);
        }

        const modelData = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
        return { avatarId: safeId, modelData };
    } catch (e) {
        console.error('Failed to load installed avatar:', e);
        throw e;
    }
});



app.whenReady().then(async () => {
    console.log('App Ready');

    // --- Install Default Avatar if needed ---
    const defaultAvatarZip = path.join(__dirname, 'assets/default_avatar.zip');

    // Check if we have any avatars
    let hasAvatars = false;
    if (fs.existsSync(AVATAR_CACHE_DIR)) {
        const entries = fs.readdirSync(AVATAR_CACHE_DIR, { withFileTypes: true });
        hasAvatars = entries.some(e => e.isDirectory());
    }

    if (!hasAvatars && fs.existsSync(defaultAvatarZip)) {
        console.log('Installing default avatar...');
        try {
            // Create cache dir if missing
            if (!fs.existsSync(AVATAR_CACHE_DIR)) {
                fs.mkdirSync(AVATAR_CACHE_DIR, { recursive: true });
            }

            const zip = new AdmZip(defaultAvatarZip);
            // We assume the zip contains the avatar files directly or in a folder. 
            // We'll extract to a specific ID folder 'default'.
            // However, typical avatar zips here might be:
            // zip root -> files (model.json etc)
            // or zip root -> folder -> files

            // Let's inspect first entry
            const zipEntries = zip.getEntries();
            if (zipEntries.length > 0) {
                const avatarId = 'default-avatar';
                const targetDir = path.join(AVATAR_CACHE_DIR, avatarId);

                fs.mkdirSync(targetDir, { recursive: true });
                zip.extractAllTo(targetDir, true);
                console.log('Default avatar installed to:', targetDir);

                // Update settings to use this new default
                const settings = dataManager.getSettings();
                settings.currentAvatarId = avatarId;
                settings.avatarPath = ''; // Clear legacy path
                dataManager.saveSettings(settings);
            }
        } catch (e) {
            console.error('Failed to install default avatar:', e);
        }
    }

    // Register avatar protocol
    protocol.registerFileProtocol('avatar', (request, callback) => {
        let url = request.url.replace('avatar://', '');

        // Strip query params
        const qIndex = url.indexOf('?');
        if (qIndex !== -1) {
            url = url.substring(0, qIndex);
        }
        // New URL Structure: avatar://<avatarId>/path/to/asset.png

        try {
            const decodedPath = decodeURIComponent(url);
            // Verify path is safe if needed, but for now map directly
            const fullPath = path.join(AVATAR_CACHE_DIR, decodedPath);

            console.log(`[Avatar Protocol] Request: ${url}`);
            console.log(`[Avatar Protocol] Decoded: ${decodedPath}`);
            console.log(`[Avatar Protocol] Full Path: ${fullPath}`);
            console.log(`[Avatar Protocol] Exists? ${fs.existsSync(fullPath)}`);

            callback({ path: fullPath });
        } catch (error) {
            console.error('Avatar protocol error:', error);
            callback({ error: -2 }); // FILE_NOT_FOUND
        }
    });

    createTray();
    createWindow();
    createAvatarWindow(); // Create avatar window
    registerGlobalShortcut();


    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
            createAvatarWindow(); // Re-create if needed
        }
    });

    if (process.platform === 'darwin') {
        const iconPath = path.join(__dirname, 'icon.png');
        app.dock.setIcon(iconPath);
    }
});

app.on('will-quit', () => {
    // Unregister all shortcuts.
    globalShortcut.unregisterAll();
});

// --- IPC for Moving Avatar Window (JS-based Drag) ---
ipcMain.on('move-avatar-window', (event, { dx, dy }) => {
    if (avatarWindow && !avatarWindow.isDestroyed()) {
        const [x, y] = avatarWindow.getPosition();
        avatarWindow.setPosition(x + Math.round(dx), y + Math.round(dy));
    }
});

app.on('window-all-closed', () => {
    // Do not quit on window close, as we have a tray icon
    if (process.platform !== 'darwin') {
        // app.quit(); // Removed to allow tray persistence
    }
});

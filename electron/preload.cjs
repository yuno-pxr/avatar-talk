const { contextBridge, ipcRenderer } = require('electron');



console.log('Preload script loaded');

contextBridge.exposeInMainWorld('electronAPI', {
    getHistory: () => ipcRenderer.invoke('get-history'),
    addHistory: (item) => ipcRenderer.invoke('add-history', item),
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    clearHistory: () => ipcRenderer.invoke('clear-history'),
    toggleClipboard: (shouldWatch) => ipcRenderer.invoke('toggle-clipboard', shouldWatch),
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    setLogDirectory: (path) => ipcRenderer.invoke('set-log-directory', path),
    getLogDirectory: () => ipcRenderer.invoke('get-log-directory'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    fetchUrlMetadata: (url) => ipcRenderer.invoke('fetch-url-metadata', url),
    minimizeWindow: () => ipcRenderer.send('minimize-window'),
    closeWindow: () => ipcRenderer.send('close-window'),
    onClipboardUpdated: (callback) => {
        const subscription = (_event, value) => callback(value);
        ipcRenderer.on('clipboard-updated', subscription);
        return () => ipcRenderer.removeListener('clipboard-updated', subscription);
    },
    onFocusInput: (callback) => {
        const subscription = () => callback();
        ipcRenderer.on('focus-input', subscription);
        return () => ipcRenderer.removeListener('focus-input', subscription);
    },
    getStartupStatus: () => ipcRenderer.invoke('get-startup-status'),
    toggleStartup: (enable) => ipcRenderer.invoke('toggle-startup', enable),
    log: (message) => ipcRenderer.send('log', message),
    getAvailableSkins: () => ipcRenderer.invoke('get-available-skins'),
    loadSkin: (skinId) => ipcRenderer.invoke('load-skin', skinId),
    selectFile: (options) => ipcRenderer.invoke('select-file', options),
    loadAvatar: (filePath) => ipcRenderer.invoke('load-avatar', filePath),
    loadInstalledAvatar: (avatarId) => ipcRenderer.invoke('load-installed-avatar', avatarId),
    getInstalledAvatars: () => ipcRenderer.invoke('get-installed-avatars'),
    deleteAvatar: (avatarId) => ipcRenderer.invoke('delete-avatar', avatarId),
    installUkagakaGhost: () => ipcRenderer.invoke('install-ukagaka-ghost'),
    installVRM: () => ipcRenderer.invoke('install-vrm'),
    updateAvatarState: (state) => ipcRenderer.send('update-avatar-state', state),
    onAvatarStateUpdate: (callback) => {
        const subscription = (_event, state) => callback(state);
        ipcRenderer.on('avatar-state-updated', subscription);
        return () => ipcRenderer.removeListener('avatar-state-updated', subscription);
    },
    getAvatarState: () => ipcRenderer.invoke('get-avatar-state'),
    resizeAvatarWindow: (width, height) => ipcRenderer.send('resize-avatar-window', { width, height }),
    setIgnoreMouseEvents: (ignore, options) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),
    syncAvatarScale: (scale) => ipcRenderer.send('sync-avatar-scale', scale),
    onAvatarScaleSync: (callback) => {
        const subscription = (_event, scale) => callback(scale);
        ipcRenderer.on('avatar-scale-sync', subscription);
        return () => ipcRenderer.removeListener('avatar-scale-sync', subscription);
    },
    getUkagakaCostumes: (avatarId) => ipcRenderer.invoke('ukagaka-get-costumes', avatarId),
    setUkagakaCostume: (avatarId, enabledBindIds) => ipcRenderer.invoke('ukagaka-set-costume', avatarId, enabledBindIds),
    showCostumeMenu: (avatarId, currentBinds, cameraControlEnabled) => ipcRenderer.send('show-costume-menu', avatarId, currentBinds, cameraControlEnabled),
    onCostumeChanged: (callback) => {
        const subscription = (_event, binds) => callback(binds);
        ipcRenderer.on('avatar-costume-changed', subscription);
        return () => ipcRenderer.removeListener('avatar-costume-changed', subscription);
    },
    onReloadAvatarImage: (callback) => {
        const subscription = () => callback();
        ipcRenderer.on('reload-avatar-image', subscription);
        return () => ipcRenderer.removeListener('reload-avatar-image', subscription);
    },
    onAvatarLoading: (callback) => {
        const subscription = (_event, isLoading) => callback(isLoading);
        ipcRenderer.on('avatar-loading', subscription);
        return () => ipcRenderer.removeListener('avatar-loading', subscription);
    },
    moveAvatarWindow: (dx, dy) => ipcRenderer.send('move-avatar-window', { dx, dy }),
    onToggleCameraControl: (callback) => {
        const subscription = () => callback();
        ipcRenderer.on('toggle-camera-control', subscription);
        return () => ipcRenderer.removeListener('toggle-camera-control', subscription);
    },
    onSettingsUpdated: (callback) => {
        const subscription = (_event, settings) => callback(settings);
        ipcRenderer.on('settings-updated', subscription);
        return () => ipcRenderer.removeListener('settings-updated', subscription);
    },
});

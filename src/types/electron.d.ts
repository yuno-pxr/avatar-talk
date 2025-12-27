export interface ElectronAPI {
    getHistory: () => Promise<any[]>;
    addHistory: (item: any) => Promise<any>;
    getSettings: () => Promise<any>;
    saveSettings: (settings: any) => Promise<void>;
    clearHistory: () => Promise<any[]>;
    toggleClipboard: (shouldWatch: boolean) => Promise<boolean>;
    selectDirectory: () => Promise<string | null>;
    setLogDirectory: (path: string) => Promise<boolean>;
    getLogDirectory: () => Promise<string>;
    getAppVersion: () => Promise<string>;
    fetchUrlMetadata: (url: string) => Promise<{ title: string; description: string }>;
    minimizeWindow: () => void;
    closeWindow: () => void;
    onClipboardUpdated: (callback: (item: any) => void) => () => void;
    onFocusInput: (callback: () => void) => () => void;
    getStartupStatus: () => Promise<boolean>;
    toggleStartup: (enable: boolean) => Promise<boolean>;
    log: (message: string) => void;
    getAvailableSkins: () => Promise<any[]>;
    loadSkin: (skinId: string) => Promise<any>;
    selectFile: (options?: any) => Promise<string | null>;
    loadAvatar: (filePath: string) => Promise<any>;
    updateAvatarState: (state: any) => void;
    onAvatarStateUpdate: (callback: (state: any) => void) => () => void;
    getAvatarState: () => Promise<any>;
    resizeAvatarWindow: (width: number, height: number) => void;
    moveAvatarWindow: (dx: number, dy: number) => void;
    setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => void;
    getInstalledAvatars: () => Promise<{ id: string, name: string, path: string }[]>;
    loadInstalledAvatar: (avatarId: string) => Promise<{ avatarId: string, modelData: any }>;
    deleteAvatar: (avatarId: string) => Promise<boolean>;
    installUkagakaGhost: () => Promise<string | null>;
    syncAvatarScale: (scale: number) => void;
    onAvatarScaleSync: (callback: (scale: number) => void) => () => void;
    getUkagakaCostumes: (avatarId: string) => Promise<{ id: number; name: string; category: string; default: boolean }[]>;
    setUkagakaCostume: (avatarId: string, enabledBindIds: number[]) => Promise<boolean>;
    showCostumeMenu: (avatarId: string, currentBinds: number[]) => void;
    onCostumeChanged: (callback: (binds: number[]) => void) => () => void;
    onReloadAvatarImage: (callback: () => void) => () => void;
    onAvatarLoading: (callback: (isLoading: boolean) => void) => () => void;
    onToggleCameraControl: (callback: () => void) => () => void;
    onSettingsUpdated: (callback: (settings: any) => void) => () => void;
}

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}

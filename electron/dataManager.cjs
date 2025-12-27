const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class DataManager {
    constructor() {
        this.userDataPath = app.getPath('userData');
        this.settingsPath = path.join(this.userDataPath, 'settings.json');

        // Load settings first to check for custom log directory
        let logDir = this.userDataPath;
        if (fs.existsSync(this.settingsPath)) {
            try {
                const settings = JSON.parse(fs.readFileSync(this.settingsPath, 'utf-8'));
                if (settings.logDirectory && fs.existsSync(settings.logDirectory)) {
                    logDir = settings.logDirectory;
                }
            } catch (e) {
                console.error('Error reading settings for log dir:', e);
            }
        }

        this.historyPath = path.join(logDir, 'history.json');

        if (!fs.existsSync(this.userDataPath)) {
            try {
                fs.mkdirSync(this.userDataPath, { recursive: true });
            } catch (e) {
                console.error('Error creating user data directory:', e);
            }
        }

        this.ensureFilesExist();
    }

    ensureFilesExist() {
        if (!fs.existsSync(this.historyPath)) {
            fs.writeFileSync(this.historyPath, JSON.stringify([], null, 2));
        }
        if (!fs.existsSync(this.settingsPath)) {
            fs.writeFileSync(this.settingsPath, JSON.stringify({
                apiKey: "",
                theme: "dark",
                themeColor: "#ef4444",
                isClipboardEnabled: true,
                isClipboardEnabled: true,
                provider: "gemini",
                apiKey: "", // Legacy/Global
                geminiApiKey: "",
                geminiModelName: "gemini-2.0-flash",
                openaiApiKey: "",
                openaiBaseUrl: "https://api.x.ai/v1",
                openaiModelName: "grok-beta",
                localBaseUrl: "http://localhost:11434/v1",
                localModelName: "llama3"
            }, null, 2));
        }
    }

    getHistory() {
        try {
            const data = fs.readFileSync(this.historyPath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error reading history:', error);
            return [];
        }
    }

    addHistoryItem(item) {
        const history = this.getHistory();
        const newItem = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            ...item
        };
        history.push(newItem);

        if (history.length > 100) {
            history.shift();
        }

        fs.writeFileSync(this.historyPath, JSON.stringify(history, null, 2));
        return newItem;
    }

    getSettings() {
        try {
            const data = fs.readFileSync(this.settingsPath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error reading settings:', error);
            return {};
        }
    }

    saveSettings(settings) {
        fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2));
    }

    clearHistory() {
        fs.writeFileSync(this.historyPath, JSON.stringify([], null, 2));
    }

    getLogDirectory() {
        return path.dirname(this.historyPath);
    }

    setLogDirectory(dirPath) {
        if (!fs.existsSync(dirPath)) {
            throw new Error('Directory does not exist');
        }
        this.historyPath = path.join(dirPath, 'history.json');
        this.ensureFilesExist();

        // Update settings to remember this path
        const settings = this.getSettings();
        settings.logDirectory = dirPath;
        this.saveSettings(settings);
    }
}

module.exports = new DataManager();

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class SkinManager {
    constructor() {
        this.userDataPath = app.getPath('userData');
        this.skinsPath = path.join(this.userDataPath, 'skins');
        this.ensureSkinsDirectory();
        this.ensureDemoSkin();
        this.ensureFlatTheme();
    }

    ensureSkinsDirectory() {
        if (!fs.existsSync(this.skinsPath)) {
            fs.mkdirSync(this.skinsPath, { recursive: true });
        }
    }

    ensureDemoSkin() {
        const demoSkinPath = path.join(this.skinsPath, 'demo_neon');
        if (!fs.existsSync(demoSkinPath)) {
            try {
                fs.mkdirSync(demoSkinPath, { recursive: true });

                const skinJson = {
                    "metadata": {
                        "name": "Neon Demonstration",
                        "version": "1.0.0",
                        "author": "Monolith",
                        "description": "A demo skin showing customizing capabilities."
                    },
                    "styles": {
                        "cssFile": "styles.css",
                        "colors": {
                            "primary": "#00ff99",
                            "background": "#0a0a12",
                            "text": "#e0e0e0"
                        }
                    }
                };

                fs.writeFileSync(path.join(demoSkinPath, 'skin.json'), JSON.stringify(skinJson, null, 2));

                const cssContent = `
/* Demo Skin CSS */
body {
    background: radial-gradient(circle at center, #1a1a2e 0%, #000000 100%);
}
button {
    border: 1px solid #00ff99;
    box-shadow: 0 0 5px #00ff99;
}
`;
                fs.writeFileSync(path.join(demoSkinPath, 'styles.css'), cssContent);
                console.log('Created demo skin at:', demoSkinPath);
            } catch (e) {
                console.error('Failed to create demo skin:', e);
            }
        }
    }

    ensureFlatTheme() {
        const flatThemePath = path.join(this.skinsPath, 'flat_theme');
        // Always try to copy in Dev mode to ensure updates, or just check existence
        // For simplicity, check existence.
        if (!fs.existsSync(flatThemePath)) {
            try {
                fs.mkdirSync(flatThemePath, { recursive: true });

                // Copy from source if available (Dev mode)
                // Assuming we are in electron/skinManager.cjs and source is at ../skins/flat_theme
                const sourcePath = path.join(__dirname, '..', 'skins', 'flat_theme');

                if (fs.existsSync(sourcePath)) {
                    console.log('Copying flat_theme from source:', sourcePath);
                    const files = fs.readdirSync(sourcePath);
                    for (const file of files) {
                        fs.copyFileSync(path.join(sourcePath, file), path.join(flatThemePath, file));
                    }
                } else {
                    // Fallback: Create manually if source not found (e.g. packaged app without extra resources)
                    const skinJson = {
                        "metadata": {
                            "name": "Flat Theme",
                            "version": "1.0.0",
                            "author": "Monolith",
                            "description": "A flat, non-gradient dark theme."
                        },
                        "styles": {
                            "cssFile": "flat.css",
                            "colors": {
                                "primary": "#3b82f6",
                                "background": "#121212",
                                "text": "#ffffff"
                            }
                        },
                        "assets": {
                            "animations": {
                                "waiting": {
                                    "url": "https://cdn.rive.app/animations/vehicles.riv",
                                    "stateMachine": "bumpy"
                                }
                            }
                        }
                    };
                    fs.writeFileSync(path.join(flatThemePath, 'skin.json'), JSON.stringify(skinJson, null, 2));

                    const cssContent = `/* Flat Theme CSS */
:root {
    --bg-primary: #121212;
    --bg-secondary: #1e1e1e;
    --text-primary: #ffffff;
    --text-secondary: #aaaaaa;
    --accent: #3b82f6;
}

body {
    background: var(--bg-primary) !important; 
    /* Force override any gradient on body if present usually defined in index.css */
}

/* Override common components to remove gradients/blur if desired */
.backdrop-blur-md {
    backdrop-filter: none !important;
    background-color: var(--bg-secondary) !important;
}

.bg-gradient-to-b {
    background-image: none !important;
    background-color: var(--bg-primary) !important;
}
`;
                    fs.writeFileSync(path.join(flatThemePath, 'flat.css'), cssContent);
                }
                console.log('Ensured flat_theme at:', flatThemePath);
            } catch (e) {
                console.error('Failed to ensure flat_theme:', e);
            }
        }
    }

    /**
     * Scans the skins directory for valid skin folders.
     * A valid skin folder must contain a skin.json file.
     * @returns {Array<Object>} List of skin metadata
     */
    getAvailableSkins() {
        this.ensureSkinsDirectory();
        const skins = [];

        try {
            const items = fs.readdirSync(this.skinsPath, { withFileTypes: true });

            for (const item of items) {
                if (item.isDirectory()) {
                    const skinJsonPath = path.join(this.skinsPath, item.name, 'skin.json');
                    if (fs.existsSync(skinJsonPath)) {
                        try {
                            const skinData = JSON.parse(fs.readFileSync(skinJsonPath, 'utf-8'));
                            // Basic validation
                            if (skinData.metadata && skinData.metadata.name) {
                                skins.push({
                                    id: item.name,
                                    path: path.join(this.skinsPath, item.name),
                                    ...skinData.metadata
                                });
                            }
                        } catch (e) {
                            console.error(`Failed to parse skin.json for ${item.name}:`, e);
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Error scanning skins directory:', e);
        }

        return skins;
    }

    /**
     * Loads the full definition of a specific skin.
     * @param {string} skinId The folder name of the skin
     * @returns {Object|null} The full skin definition with resolved paths
     */
    loadSkin(skinId) {
        if (!skinId) return null;

        const skinDir = path.join(this.skinsPath, skinId);
        const skinJsonPath = path.join(skinDir, 'skin.json');

        if (!fs.existsSync(skinJsonPath)) {
            return null;
        }

        try {
            const skinData = JSON.parse(fs.readFileSync(skinJsonPath, 'utf-8'));

            // Resolve asset paths to absolute file URLs for the renderer
            if (skinData.assets && skinData.assets.images) {
                for (const [key, relativePath] of Object.entries(skinData.assets.images)) {
                    skinData.assets.images[key] = `file://${path.join(skinDir, relativePath).replace(/\\/g, '/')}`;
                }
            }

            if (skinData.assets && skinData.assets.animations) {
                for (const [key, animDef] of Object.entries(skinData.assets.animations)) {
                    if (animDef.path) {
                        animDef.path = `file://${path.join(skinDir, animDef.path).replace(/\\/g, '/')}`;
                    }
                }
            }

            // Resolve CSS file path
            if (skinData.styles && skinData.styles.cssFile) {
                // We don't read the file here, just provide the absolute path/URL so the frontend can link it
                // OR we can read it and return content. 
                // Linking a local file in Electron renderer might be blocked by CSP unless allowed.
                // Safer to read content or use file protocol if allowed.
                // Let's rely on file protocol for now.
                skinData.styles.cssFileUrl = `file://${path.join(skinDir, skinData.styles.cssFile).replace(/\\/g, '/')}`;
            }

            return skinData;
        } catch (e) {
            console.error(`Error loading skin ${skinId}:`, e);
            return null;
        }
    }
}

module.exports = new SkinManager();

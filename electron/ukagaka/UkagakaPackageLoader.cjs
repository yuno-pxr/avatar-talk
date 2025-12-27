const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const iconv = require('iconv-lite');

class UkagakaPackageLoader {
    constructor(filePath) {
        this.filePath = filePath;
        // Temporary extraction path
        const tmpDir = require('os').tmpdir();
        this.extractPath = path.join(tmpDir, 'ukagaka_extract_' + Date.now());
        this.results = null;
    }

    async load() {
        if (!this.filePath) throw new Error('No file path provided');
        this.results = await this.loadPackage(this.filePath, this.extractPath);
        return this.results;
    }

    /**
     * Loads a .nar or .zip file and extracts it to a target directory.
     * Handles Shift_JIS filename decoding if necessary.
     * @param {string} filePath - Path to the .nar/.zip file
     * @param {string} extractPath - Directory to extract to
     * @returns {Promise<Object>} - Structure info { ghostDir, shellDir, installDir }
     */
    async loadPackage(filePath, extractPath) {
        // ... (existing implementation)
        console.log(`[UkagakaPackageLoader] Loading package: ${filePath}`);

        try {
            // Check if file exists
            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }

            // Create extract directory
            if (!fs.existsSync(extractPath)) {
                fs.mkdirSync(extractPath, { recursive: true });
            }

            const zip = new AdmZip(filePath);
            const zipEntries = zip.getEntries();

            console.log(`[UkagakaPackageLoader] Found ${zipEntries.length} entries.`);

            for (const entry of zipEntries) {
                // Determine encoding. 
                // AdmZip might have already garbled the name if it wasn't UTF8, 
                // but getting raw entry name buffer is safer if we can.
                // Unfortunately adm-zip implementation of entry.entryName is string.
                // Use rawEntryName if available or assume adm-zip tried generic decoding.

                // For simplified implementation, we trust adm-zip or try to fix common mojibake if needed.
                // Ideally, we should use a library that gives raw buffers for filenames, like 'yauzl'.
                // However, let's try standard extraction first.

                // Note: Standard Ukagaka ghosts use Shift_JIS or CP932.
                // Recent ones might use UTF-8.

                const rawName = entry.rawEntryName; // Buffer
                let entryName = entry.entryName;

                if (rawName) {
                    // Try to detect if it looks like UTF8
                    // If not, decode as Shift_JIS
                    // This is a heuristic.
                    if (!this.isUtf8(rawName)) {
                        entryName = iconv.decode(rawName, 'Shift_JIS');
                    } else {
                        entryName = entry.entryName.toString('utf8');
                    }
                }

                // Sanitize path to prevent Zip Slip
                const safeName = path.normalize(entryName).replace(/^(\.\.[\/\\])+/, '');

                if (entry.isDirectory) {
                    const targetDir = path.join(extractPath, safeName);
                    if (!fs.existsSync(targetDir)) {
                        fs.mkdirSync(targetDir, { recursive: true });
                    }
                } else {
                    const targetFile = path.join(extractPath, safeName);
                    const targetDir = path.dirname(targetFile);
                    if (!fs.existsSync(targetDir)) {
                        fs.mkdirSync(targetDir, { recursive: true });
                    }

                    const content = entry.getData(); // Buffer
                    fs.writeFileSync(targetFile, content);
                }
            }

            console.log(`[UkagakaPackageLoader] Extraction complete.`);

            return this.analyzeDirectory(extractPath);

        } catch (error) {
            console.error('[UkagakaPackageLoader] Error loading package:', error);
            throw error;
        }
    }

    isUtf8(buffer) {
        // Simple check: try to decode as utf8 and see if it contains replacement chars or fails
        try {
            // This is not perfect, but good enough for now
            const str = buffer.toString('utf8');
            return !str.includes('');
        } catch (e) {
            return false;
        }
    }

    /**
     * Analyzes the extracted directory to find ghosts and shells.
     */
    analyzeDirectory(dirPath) {
        // Look for 'ghost/master/descript.txt' or similar structures
        // Common structure:
        // root/
        //   ghost/
        //     master/
        //   shell/
        //     master/

        let structure = {
            hasGhost: false,
            hasShell: false,
            ghostDirs: [],
            shellDirs: []
        };

        const visit = (currentPath, depth = 0) => {
            if (depth > 3) return; // Limit recursion

            const items = fs.readdirSync(currentPath, { withFileTypes: true });

            for (const item of items) {
                if (item.isDirectory()) {
                    const fullPath = path.join(currentPath, item.name);

                    // Check for descript.txt
                    if (fs.existsSync(path.join(fullPath, 'descript.txt'))) {
                        // Read descript.txt to see type
                        // This will be implemented in detail later
                        const type = this.detectType(fullPath);
                        if (type === 'ghost') structure.ghostDirs.push(fullPath);
                        if (type === 'shell') structure.shellDirs.push(fullPath);
                    }

                    if (item.name === 'ghost') structure.hasGhost = true;
                    if (item.name === 'shell') structure.hasShell = true;

                    visit(fullPath, depth + 1);
                }
            }
        };

        visit(dirPath);
        return structure;
    }

    detectType(dirPath) {
        try {
            const descriptPath = path.join(dirPath, 'descript.txt');
            const data = fs.readFileSync(descriptPath); // buffer

            // Decript.txt is often Shift_JIS
            let content = iconv.decode(data, 'Shift_JIS');
            if (content.includes('')) {
                // Try UTF8 if Shift_JIS failed clearly
                content = data.toString('utf8');
            }

            if (content.includes('type,ghost')) return 'ghost';
            if (content.includes('type,shell')) return 'shell';

            // Heuristic if type is missing
            if (fs.existsSync(path.join(dirPath, 'surfaces.txt'))) return 'shell';
            if (fs.existsSync(path.join(dirPath, 'ghost-master.shiori'))) return 'ghost';

            return 'unknown';
        } catch (e) {
            return 'unknown';
        }
    }
}

module.exports = UkagakaPackageLoader;

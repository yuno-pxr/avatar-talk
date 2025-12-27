const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

class SurfacesParser {
    async parseDirectory(dirPath) {
        try {
            const files = fs.readdirSync(dirPath);
            const surfaceFiles = files.filter(f => f.match(/^surfaces.*\.txt$/i));

            // Allow specific ordering if needed, but usually alphabetical or load order is fine
            // Typically surfaces.txt comes first if exists.
            surfaceFiles.sort((a, b) => {
                if (a.toLowerCase() === 'surfaces.txt') return -1;
                if (b.toLowerCase() === 'surfaces.txt') return 1;
                return a.localeCompare(b);
            });

            console.log(`[SurfacesParser] Loading ${surfaceFiles.length} surface definition files.`);

            let aggregatedContent = '';
            for (const file of surfaceFiles) {
                const fullPath = path.join(dirPath, file);
                const buffer = fs.readFileSync(fullPath);
                // Assume Shift_JIS for all
                aggregatedContent += iconv.decode(buffer, 'Shift_JIS') + '\n';
            }

            return this.parseContent(aggregatedContent);
        } catch (e) {
            console.error('Error parsing surfaces directory:', e);
            throw e;
        }
    }

    /**
     * Parses a surfaces.txt file content.
     * @param {string} filePath - Path to surfaces.txt
     * @returns {Promise<Object>} - Parsed surface data
     */
    async parseFile(filePath) {
        try {
            const buffer = fs.readFileSync(filePath);
            // Decode as Shift_JIS by default, fall back if explicitly UTF8 BOM is present (rare)
            // Or try to detect. For now, force Shift_JIS as per spec/convention.
            const content = iconv.decode(buffer, 'Shift_JIS');
            return this.parseContent(content);
        } catch (e) {
            console.error('Error parsing surfaces.txt:', e);
            throw e;
        }
    }

    parseContent(content) {
        const lines = content.split(/\r?\n/);
        const surfaces = {};
        const aliases = {}; // surface.alias

        // Global settings
        const settings = {
            version: 1,
            'collision-sort': 'ascend',
            'animation-sort': 'ascend'
        };

        let currentScope = null; // 'surface0' etc
        let currentSurfaceId = null;
        let bracketLevel = 0;
        let inDescript = false;

        for (let line of lines) {
            line = line.trim();
            if (!line || line.startsWith('//')) continue; // Skip comments and empty lines

            // Descript block detection
            if (line.toLowerCase() === 'descript') {
                inDescript = true;
                continue;
            }
            if (inDescript && line.startsWith('{')) {
                continue;
            }
            if (inDescript && line.startsWith('}')) {
                inDescript = false;
                continue;
            }
            if (inDescript) {
                const [key, val] = line.split(',').map(s => s.trim().toLowerCase());
                if (key && val) {
                    settings[key] = val;
                }
                continue;
            }

            // 1. Definition Start: "surface0" or "surface0,surface1"
            if (bracketLevel === 0 && !line.startsWith('{') && !line.startsWith('}')) {
                // Potential surface definition
                // Handle aliases like: surface.append0
                // For simplified impl, focus on standard numeric surfaces

                // Matches: surface0 or surface0,surface1
                if (line.match(/^surface(\.append)?.*[\d]+/i)) {
                    currentScope = line;
                    // Extract IDs
                    const content = line.replace(/^surface(\.append)?/i, '').trim();
                    const parts = content.split(',');

                    const newIds = new Set();
                    const excludeIds = new Set();

                    parts.forEach(part => {
                        part = part.trim();
                        if (!part) return;

                        let isExclusion = false;
                        if (part.startsWith('!')) {
                            isExclusion = true;
                            part = part.substring(1);
                        }

                        let range = [parseInt(part, 10)];
                        if (part.includes('-')) {
                            const [start, end] = part.split('-').map(n => parseInt(n, 10));
                            if (!isNaN(start) && !isNaN(end)) {
                                range = [];
                                for (let i = start; i <= end; i++) range.push(i);
                            }
                        }

                        if (isNaN(range[0])) return;

                        range.forEach(id => {
                            if (isExclusion) excludeIds.add(id);
                            else newIds.add(id);
                        });
                    });

                    // Remove exclusions
                    excludeIds.forEach(id => newIds.delete(id));

                    currentSurfaceId = Array.from(newIds);
                }
            }

            // 2. Block Start
            if (line.startsWith('{')) {
                bracketLevel++;

                // Initialize objects for these IDs if needed
                if (currentSurfaceId) {
                    currentSurfaceId.forEach(id => {
                        if (!surfaces[id]) {
                            surfaces[id] = {
                                elements: [],
                                collisions: [],
                                animations: {}
                            };
                        }
                    });
                }
                continue;
            }

            // 3. Block End
            if (line.startsWith('}')) {
                bracketLevel--;
                if (bracketLevel === 0) {
                    currentScope = null;
                    currentSurfaceId = null;
                }
                continue;
            }

            // 4. Inside Block
            if (bracketLevel > 0 && currentSurfaceId) {
                // element0,overlay,wd000.png,0,0
                if (line.startsWith('element')) {
                    const parsed = this.parseElement(line);
                    if (parsed) {
                        currentSurfaceId.forEach(id => surfaces[id].elements.push(parsed));
                    }
                }
                // collision0,56,45,98,89,Head
                else if (line.startsWith('collision')) {
                    const parsed = this.parseCollision(line);
                    if (parsed) {
                        currentSurfaceId.forEach(id => surfaces[id].collisions.push(parsed));
                    }
                }
                // animation0.interval,never
                else if (line.startsWith('animation')) {
                    const { id, type, data } = this.parseAnimation(line);
                    if (id !== null) {
                        currentSurfaceId.forEach(sid => {
                            if (!surfaces[sid].animations[id]) {
                                surfaces[sid].animations[id] = { interval: 'never', patterns: [] };
                            }
                            if (type === 'interval') {
                                surfaces[sid].animations[id].interval = data;
                            } else if (type === 'pattern') {
                                surfaces[sid].animations[id].patterns.push(data);
                            }
                        });
                    }
                }
            }
        }

        return { surfaces, aliases, settings };
    }

    parseElement(line) {
        // format: elementID, method, filename, x, y
        // e.g. element0,overlay,surface0.png,0,0
        const parts = line.split(',');
        if (parts.length < 3) return null;

        const idStr = parts[0].match(/element(\d+)/i);
        if (!idStr) return null;

        return {
            id: parseInt(idStr[1], 10),
            method: parts[1],
            file: parts[2],
            x: parseInt(parts[3] || '0', 10),
            y: parseInt(parts[4] || '0', 10)
        };
    }

    parseCollision(line) {
        // format: collisionID, x, y, x2, y2, name
        // e.g. collision0,10,10,50,50,Head
        const parts = line.split(',');
        if (parts.length < 6) return null;

        const idStr = parts[0].match(/collision(\d+)/i);
        if (!idStr) return null;

        return {
            id: parseInt(idStr[1], 10),
            x: parseInt(parts[1], 10),
            y: parseInt(parts[2], 10),
            x2: parseInt(parts[3], 10),
            y2: parseInt(parts[4], 10), // Note: Ukagaka usually uses right/bottom or width/height? Spec says: left, top, right, bottom
            name: parts[5]
        };
    }

    parseAnimation(line) {
        // formats:
        // animation0.interval,random,10
        // animation0.pattern0,overlay,100,0,0,0
        // animation0.pattern1,overlay,101,50,0,0

        const parts = line.split(',');
        const key = parts[0];

        const animIdMatch = key.match(/animation(\d+)\.(.+)/i);
        if (!animIdMatch) return { id: null };

        const animId = parseInt(animIdMatch[1], 10);
        const subType = animIdMatch[2]; // 'interval' or 'pattern0'

        if (subType === 'interval') {
            return {
                id: animId,
                type: 'interval',
                data: parts[1] // 'random', 'runonce', etc
            };
        } else if (subType.startsWith('pattern')) {
            // pattern0
            const patternIdMatch = subType.match(/pattern(\d+)/i);
            const patternId = patternIdMatch ? parseInt(patternIdMatch[1], 10) : 0;

            return {
                id: animId,
                type: 'pattern',
                data: {
                    id: patternId,
                    method: parts[1], // overlay, base, move...
                    surface: parts[2], // surface ID or -1
                    wait: parts[3], // wait time
                    x: parseInt(parts[4] || '0', 10),
                    y: parseInt(parts[5] || '0', 10)
                }
            };
        }

        return { id: null };
    }
}

module.exports = new SurfacesParser();

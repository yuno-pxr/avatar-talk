const fs = require('fs');
const path = require('path');
const descriptParser = require('./DescriptParser.cjs');
const surfacesParser = require('./SurfacesParser.cjs');
const surfaceCompositor = require('./SurfaceCompositor.cjs');
const { app } = require('electron'); // This might fail in strict node, but 'electron' npm package exports a path usually.
// In actual Electron runtime, it works. In Node test script, it might be undefined or throw.

class UkagakaAvatarAdapter {
    /**
     * @param {string} [customCachePath] - Optional override for cache path (for testing)
     */
    constructor(customCachePath) {
        if (customCachePath) {
            this.cachebase = customCachePath;
        } else {
            // Lazy access to app
            try {
                const electron = require('electron');
                if (electron.app) {
                    this.cachebase = path.join(electron.app.getPath('userData'), 'avatar_cache');
                } else {
                    // Fallback if app is not available (dev mode/testing without inject)
                    this.cachebase = path.join(__dirname, '../../temp_avatar_cache');
                    console.warn('[UkagakaAvatarAdapter] Electron app not found, using temp path:', this.cachebase);
                }
            } catch (e) {
                this.cachebase = path.join(__dirname, '../../temp_avatar_cache');
                console.warn('[UkagakaAvatarAdapter] Electron require failed, using temp path:', this.cachebase);
            }
        }
    }

    /**
     * Converts a Ukagaka ghost (shell) to an EMG-lite avatar.
     * @param {string} extractPath - Root of extracted ghost package
     * @param {string} shellDir - Path to the shell to use
     * @returns {Promise<string>} - The ID of the installed avatar
     */
    async convertAndInstall(extractPath, shellDir) {
        console.log('[UkagakaAvatarAdapter] Starting conversion...');

        // 1. Parse Metadata
        const descript = descriptParser.parseFile(path.join(shellDir, 'descript.txt'));
        const shellName = descript['name'] || 'unknown_shell';
        const defaultBinds = descript['_defaults'] || [];
        console.log(`[UkagakaAvatarAdapter] Default Binds: ${defaultBinds.join(', ')}`);

        // Generate ID
        const avatarId = `ukagaka-${shellName.replace(/[^a-zA-Z0-9-_]/g, '')}-${Date.now()}`;
        const installDir = path.join(this.cachebase, avatarId);

        if (!fs.existsSync(installDir)) {
            fs.mkdirSync(installDir, { recursive: true });
        }

        // 2. Parse Surfaces
        const surfacesData = await surfacesParser.parseDirectory(shellDir);
        const { surfaces, aliases } = surfacesData;

        // 3. Convert / Composite Assets
        // Map standard Seriko IDs to EMG emotions
        // 0: Neutral, 2: Happy, 4: Angry, 6: Sad

        // Define standard mappings
        const standardMap = {
            'idle.neutral': 0,
            'idle.happy': 2,
            'idle.angry': 4,
            'idle.sad': 6
            // TODO: 'idle.fun' -> ?
        };

        const mapping = {};
        const styles = {}; // For model.json mapping (V1 object)

        // Process each mapped emotion
        for (const [key, sid] of Object.entries(standardMap)) {
            if (surfaces[sid]) {
                mapping[key] = sid;
            } else if (key === 'idle.neutral') {
                throw new Error('Surface 0 (default) not found in shell.');
            }
        }

        // Fallback for missing emotions (map to neutral)
        if (!mapping['idle.happy']) mapping['idle.happy'] = 0;

        // Helper to collect collisions
        const collisionsMap = {};

        // Helper to flatten surface (resolve 'always' animations)
        const flattenSurface = (sid, xOffset = 0, yOffset = 0, depth = 0, excludeAnimId = null, overrides = {}) => {
            if (depth > 10) return []; // Prevent infinite recursion

            // Apply override if present (swap one surface ID for another)
            const currentSid = overrides[sid] !== undefined ? overrides[sid] : sid;

            let elements = [];
            const s = surfaces[currentSid];

            // Check for implicit base image (surfaceN.png or surface0N.png)
            let implicitBase = `surface${currentSid}.png`;
            let foundImplicit = false;

            if (fs.existsSync(path.join(shellDir, implicitBase))) {
                foundImplicit = true;
            } else if (currentSid < 10) {
                const padded = `surface0${currentSid}.png`;
                if (fs.existsSync(path.join(shellDir, padded))) {
                    implicitBase = padded;
                    foundImplicit = true;
                }
            }

            if (foundImplicit) {
                elements.push({
                    file: implicitBase,
                    x: xOffset,
                    y: yOffset,
                    method: 'base'
                });
            }

            if (!s) return elements;

            // 1. Base elements
            if (s.elements) {
                // elements = s.elements.map(e => ({...}));
                // UPDATED: Recurse if element file is a valid surface ID
                for (const e of s.elements) {
                    const targetSid = parseInt(e.file, 10);
                    // Check if is number and exists in surfaces
                    if (!isNaN(targetSid) && surfaces[targetSid]) {
                        // Recurse
                        const childElements = flattenSurface(targetSid,
                            (parseInt(e.x) || 0) + xOffset,
                            (parseInt(e.y) || 0) + yOffset,
                            depth + 1, excludeAnimId, overrides);
                        elements = elements.concat(childElements);
                    } else {
                        // Regular image reference
                        elements.push({
                            ...e,
                            x: (parseInt(e.x) || 0) + xOffset,
                            y: (parseInt(e.y) || 0) + yOffset
                        });
                    }
                }
            }

            // 2. Process animations
            if (s.animations) {
                const sortOrder = 'ascend';
                let animIds = Object.keys(s.animations).map(id => parseInt(id, 10)).filter(n => !isNaN(n));
                animIds.sort((a, b) => a - b);

                for (const animId of animIds) {
                    if (excludeAnimId !== null && animId === excludeAnimId) continue;

                    const anim = s.animations[animId];
                    let shouldProcess = false;

                    if (anim.interval.includes('always')) {
                        shouldProcess = true;
                    } else if (anim.interval.includes('bind')) {
                        if (defaultBinds && defaultBinds.includes(animId)) {
                            shouldProcess = true;
                        }
                    } else if (anim.interval.includes('periodic') || anim.interval.includes('blink') || anim.interval.includes('random') || anim.interval.includes('sometimes')) {
                        shouldProcess = true;
                    }

                    if (shouldProcess) {
                        if (anim.patterns && anim.patterns.length > 0) {
                            const pat = anim.patterns[0];
                            const targetSid = parseInt(pat.surface, 10);

                            if (!isNaN(targetSid)) {
                                const patX = (pat.x || 0);
                                const patY = (pat.y || 0);
                                // Pass overrides recursively
                                const childElements = flattenSurface(targetSid, xOffset + patX, yOffset + patY, depth + 1, excludeAnimId, overrides);
                                elements = elements.concat(childElements);
                            }
                        }
                    }
                }
            }
            return elements;
        };

        // Helper to collect ALL active animations in the dependency tree of a surface
        const collectAnimations = (sid, collected = {}, depth = 0) => {
            if (depth > 10) return;
            // Handle exclusions or visited? For now depth limit handles loops.
            if (!surfaces[sid]) return;

            // Add own animations
            if (surfaces[sid].animations) {
                for (const [id, anim] of Object.entries(surfaces[sid].animations)) {
                    collected[id] = { anim, ownerSid: sid };
                }
            }

            // Recurse into dependencies (elements + always/bind animations)

            // 1. Elements
            if (surfaces[sid].elements) {
                for (const el of surfaces[sid].elements) {
                    // Parse element ID/File?
                    // Element Parser returns: { id, method, file, x, y }
                    // file often refers to a surface definition if not .png?
                    // Actually parser says 'file'. If it's a number/surface ID...
                    // Wait, surfaces-base.txt uses 'element0,overlay,11100,0,0'.
                    // file='11100'.
                    const targetSid = parseInt(el.file, 10);
                    if (!isNaN(targetSid)) {
                        collectAnimations(targetSid, collected, depth + 1);
                    }
                }
            }

            // 2. Animations (bind/always patterns)
            if (surfaces[sid].animations) {
                for (const animId of Object.keys(surfaces[sid].animations)) {
                    const anim = surfaces[sid].animations[animId];
                    let shouldRecurse = false;
                    if (anim.interval.includes('always')) shouldRecurse = true;
                    else if (anim.interval.includes('bind')) {
                        if (defaultBinds && defaultBinds.includes(parseInt(animId))) shouldRecurse = true;
                    }

                    if (shouldRecurse && anim.patterns && anim.patterns.length > 0) {
                        const targetSid = parseInt(anim.patterns[0].surface, 10); // Check first pattern
                        if (!isNaN(targetSid)) {
                            collectAnimations(targetSid, collected, depth + 1);
                        }
                    }
                }
            }
            return collected;
        };

        // Process surfaces
        const uniqueSurfaces = new Set(Object.values(mapping));
        const processedBuffers = {}; // sid -> buffer

        for (const [mapKey, sid] of Object.entries(mapping)) {
            // Only process each unique surface ID once
            if (!processedBuffers[sid]) {
                if (!processedBuffers[sid]) {
                    // Try to flatten (handles both explicit surfaces and implicit PNGs)
                    const flatElements = flattenSurface(sid, 0, 0, 0);

                    if (flatElements.length > 0) {
                        console.log(`[UkagakaAvatarAdapter] Compositing Surface ${sid} for ${mapKey}...`);

                        // Compose
                        const compositeDef = {
                            elements: flatElements
                        };

                        const buffer = await surfaceCompositor.composeSurface(shellDir, compositeDef);
                        processedBuffers[sid] = buffer;

                        // Collect collisions from base surface (if defined)
                        if (surfaces[sid] && surfaces[sid].collisions) {
                            collisionsMap[mapKey] = surfaces[sid].collisions.map(c => ({
                                id: c.id,
                                type: 'rect',
                                rect: [c.rect[0], c.rect[1], c.rect[2] - c.rect[0], c.rect[3] - c.rect[1]],
                                name: c.name
                            }));
                        }

                    } else {
                        console.warn(`[UkagakaAvatarAdapter] Mapped surface ${sid} for ${mapKey} not found (No elements or implicit image).`);
                        continue;
                    }
                }
            }

            // Save base file
            const filename = `surface${sid}.png`;
            if (processedBuffers[sid]) {
                const outPath = path.join(installDir, filename);
                fs.writeFileSync(outPath, processedBuffers[sid]);
            }

            // Convert detected animations to V1 keys (eyesClosed, mouthOpen)
            const v1Style = {
                base: filename
            };

            // Detect and render animations (RECURSIVE)
            const allAnimations = collectAnimations(sid);

            // Inject missing default binds (if heuristic matches mouth/eyes)
            // This covers cases where surface0 relies on implicit global binds not listed in elements
            if (defaultBinds) {
                for (const bindId of defaultBinds) {
                    // Check if this bind ID is relevant (Eyes 110xx, Mouth 111xx)
                    // Or just generic injection?
                    // Only inject if it has animations
                    if (!allAnimations[bindId] && surfaces[bindId] && surfaces[bindId].animations) {
                        // Find the 'bind' animation ID. Usually matches the surface ID for Shizuku.
                        // But we should check surfaces[bindId].animations keys
                        const animKeys = Object.keys(surfaces[bindId].animations);
                        for (const ak of animKeys) {
                            const anim = surfaces[bindId].animations[ak];
                            if (anim.interval.includes('bind')) {
                                // Add it
                                allAnimations[ak] = { anim, ownerSid: bindId };
                            }
                        }
                    }
                }
            }

            if (allAnimations) {
                for (const [animIdStr, { anim, ownerSid }] of Object.entries(allAnimations)) {
                    let type = null;
                    const numericAnimId = parseInt(animIdStr, 10);
                    const ownerSidNum = parseInt(ownerSid, 10);

                    if (anim.interval.includes('talk')) {
                        type = 'talk';
                    } else if (anim.interval.includes('periodic') || anim.interval.includes('blink') || anim.interval.includes('random') || anim.interval.includes('sometimes')) {
                        type = 'blink';
                    } else if (anim.interval.includes('bind')) {
                        if (defaultBinds && defaultBinds.includes(numericAnimId) && anim.patterns && anim.patterns.length > 0) { // Changed length check > 0
                            // Heuristics for Shizuku / Standard:
                            // 110xx = Eyes (Blink)
                            // 111xx = Mouth (Talk)

                            if (ownerSidNum >= 11000 && ownerSidNum < 11100) type = 'blink';
                            else if (ownerSidNum >= 11100 && ownerSidNum < 11200) type = 'talk';
                            else {
                                if (numericAnimId >= 11000 && numericAnimId < 11100) type = 'blink';
                                else if (numericAnimId >= 11100 && numericAnimId < 11200) type = 'talk';
                            }
                        }
                    }

                    if (type) {
                        if (anim.patterns && anim.patterns.length > 0) {
                            let targetPat = null;

                            if (type === 'blink') {
                                // Blink heuristics: try middle, or first non-owner
                                if (anim.patterns.length > 1) {
                                    targetPat = anim.patterns[Math.floor(anim.patterns.length / 2)];
                                } else {
                                    targetPat = anim.patterns[0];
                                }
                            } else if (type === 'talk') {
                                // Talk heuristic: Find a pattern that is DIFFERENT from ownerSid
                                // Usually ownerSid = Closed. Pattern -> Open.
                                for (const pat of anim.patterns) {
                                    const patSid = parseInt(pat.surface, 10);
                                    if (!isNaN(patSid) && patSid !== ownerSidNum) {
                                        targetPat = pat;
                                        break;
                                    }
                                }
                                // Fallback: use pattern matching "1" or "2" suffix logic?
                                // Or just use the first valid pattern if loop failed?
                                if (!targetPat && anim.patterns.length > 1) {
                                    targetPat = anim.patterns[1];
                                } else if (!targetPat) {
                                    targetPat = anim.patterns[0];
                                }
                            }

                            if (targetPat) {
                                const patSid = parseInt(targetPat.surface, 10);

                                if (!isNaN(patSid)) {
                                    // Generate Frame with override!
                                    const overrides = {
                                        [ownerSidNum]: patSid
                                    };

                                    // Also exclude the animation itself to avoid double drawing
                                    const overrideElements = flattenSurface(sid, 0, 0, 0, numericAnimId, overrides);
                                    const patElements = flattenSurface(patSid, (targetPat.x || 0), (targetPat.y || 0), 0);

                                    // Combine
                                    // frameElements has the base (with swaps).
                                    // We append patElements.

                                    // Result:
                                    // If 11100 was in base: It matches override -> Becomes 11101.
                                    // We append 11101.
                                    // Result: 11101 drawn twice. Visual: OK (perfect overlap).

                                    // If 11100 was NOT in base: Base is empty/body.
                                    // We append 11101.
                                    // Result: Body + 11101. Visual: OK (Mouth appears).

                                    // Conclusion: ALWAYS APPEND the target pattern elements for blink/talk frames!
                                    // AND using `flattenSurface` with exclusion/overrides handles the "Base" correctly (removing original if present).

                                    const frameBufferElements = overrideElements.concat(patElements);

                                    const frameBuffer = await surfaceCompositor.composeSurface(shellDir, { elements: frameBufferElements });
                                    const frameName = `surface${sid}_${type}_${numericAnimId}_v1.png`; // Unique per animation
                                    fs.writeFileSync(path.join(installDir, frameName), frameBuffer);

                                    if (type === 'blink') {
                                        v1Style.eyesClosed = frameName;
                                    } else if (type === 'talk') {
                                        v1Style.mouthOpen = frameName;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Add to styles (mapping)
            styles[mapKey] = v1Style;
        }

        // 4. Generate model.json
        // Extract Bind Groups for Costume Switching (Use parsed costumes from DescriptParser)
        let costumeList = descript['_costumes'] || [];

        // If no costumes found in descript.txt, try fallback or leave empty.
        // (Costumes defined only in surfaces.txt without names in descript.txt might exist but won't be listed in menu)
        // TODO: Scan surfaces for `animation.patternN.bind` and auto-add unknown groups?

        console.log(`[UkagakaAvatarAdapter] Found ${costumeList.length} costumes.`);

        // Save parsed surfaces for fast recomposition
        const cacheData = {
            surfaces,
            aliases,
            costumes: costumeList,
            shellDir // Parsing relative paths might need this
        };
        fs.writeFileSync(path.join(installDir, 'surfaces.json'), JSON.stringify(cacheData));

        const modelData = {
            version: '1.0', // Reverting to 1.0 logic for compatibility
            mapping: styles, // Reverted to 'mapping'
            width: 0,
            height: 0,
            meta: {
                name: shellName,
                author: descript['author'] || 'Unknown',
                type: 'ukagaka',
                originalName: shellName,
                descript: descript,
                costumes: costumeList // Expose to frontend
            }
        };

        fs.writeFileSync(path.join(installDir, 'model.json'), JSON.stringify(modelData, null, 2));
        console.log(`[UkagakaAvatarAdapter] Conversion complete. Installed to ${avatarId}`);

        return avatarId;
    }

    /**
     * Re-composes the avatar surfaces based on enabled bind IDs (Costumes).
     * @param {string} installDir 
     * @param {number[]} enabledBindIds 
     */
    async recompose(installDir, enabledBindIds) {
        console.log(`[UkagakaAvatarAdapter] Recomposing ${installDir} with binds: ${enabledBindIds}`);
        const surfacesJsonPath = path.join(installDir, 'surfaces.json');
        if (!fs.existsSync(surfacesJsonPath)) {
            throw new Error('surfaces.json not found. Please re-import the ghost.');
        }

        const cacheData = JSON.parse(fs.readFileSync(surfacesJsonPath, 'utf8'));
        const { surfaces, aliases, costumes, shellDir } = cacheData;

        // Ethical Guard: Check if we are disabling all costumes
        // If enabledBindIds is empty, check if we have costumes at all.
        // If so, revert to defaults.
        // NOTE: enabledBindIds comes from frontend. If user DESELECTED all, it is empty.
        // Only apply guard if costumes exist.
        if (costumes && costumes.length > 0 && (!enabledBindIds || enabledBindIds.length === 0)) {
            const defaults = costumes.filter(c => c.default).map(c => c.id);
            if (defaults.length > 0) {
                console.log('[UkagakaAvatarAdapter] Ethical Guard: Reverting to defaults.');
                enabledBindIds = defaults;
            }
        }

        // Initialize Compositor
        // We need to require it here if not available, or use the module-level one
        // module-level 'surfaceCompositor' is an instance?
        // const surfaceCompositor = require('./SurfaceCompositor.cjs'); // It is required at top.
        // But the top one is an INSTANCE? 'module.exports = new SurfaceCompositor()'?
        // Check SurfacesParser... "module.exports = new SurfacesParser()".
        // SurfaceCompositor: I need to check. Usually classes are exported?
        // In lines 1-6 I saw: `const surfaceCompositor = require('./SurfaceCompositor.cjs');`
        // So I can use `surfaceCompositor`.

        // Helper to flatten surface (Scoped to this method)
        // DUPLICATED LOGIC FIX: Must match the fix in convertAndInstall
        const flattenSurface = (sid, xOffset = 0, yOffset = 0, depth = 0, excludeAnimId = null, overrides = {}) => {
            if (depth > 10) return [];

            const currentSid = overrides[sid] !== undefined ? overrides[sid] : sid;
            let elements = [];

            // Check for implicit base image (surfaceN.png or surface0N.png)
            let implicitBase = `surface${currentSid}.png`;
            let foundImplicit = false;

            if (fs.existsSync(path.join(shellDir, implicitBase))) {
                foundImplicit = true;
            } else if (currentSid < 10) {
                const padded = `surface0${currentSid}.png`;
                if (fs.existsSync(path.join(shellDir, padded))) {
                    implicitBase = padded;
                    foundImplicit = true;
                }
            }

            if (foundImplicit) {
                elements.push({
                    file: implicitBase,
                    x: xOffset,
                    y: yOffset,
                    method: 'base'
                });
            }

            const s = surfaces[currentSid];
            if (!s) return elements;

            // 1. Base elements (Recurse logic)
            if (s.elements) {
                for (const e of s.elements) {
                    const targetSid = parseInt(e.file, 10);
                    if (!isNaN(targetSid) && surfaces[targetSid]) {
                        const childElements = flattenSurface(targetSid,
                            (parseInt(e.x) || 0) + xOffset,
                            (parseInt(e.y) || 0) + yOffset,
                            depth + 1, excludeAnimId, overrides);
                        elements = elements.concat(childElements);
                    } else {
                        elements.push({
                            ...e,
                            x: (parseInt(e.x) || 0) + xOffset,
                            y: (parseInt(e.y) || 0) + yOffset
                        });
                    }
                }
            }

            // 2. Process animations
            if (s.animations) {
                const sortOrder = 'ascend';
                let animIds = Object.keys(s.animations).map(id => parseInt(id, 10)).filter(n => !isNaN(n));
                animIds.sort((a, b) => a - b);

                for (const animId of animIds) {
                    if (excludeAnimId !== null && animId === excludeAnimId) continue;
                    const anim = s.animations[animId];
                    let shouldProcess = false;

                    if (anim.interval.includes('always')) {
                        shouldProcess = true;
                    } else if (anim.interval.includes('bind')) {
                        if (enabledBindIds && enabledBindIds.includes(animId)) {
                            shouldProcess = true; // Use passed enabledBindIds
                        }
                    }

                    if (shouldProcess) {
                        if (anim.patterns && anim.patterns.length > 0) {
                            const pat = anim.patterns[0];
                            const targetSid = parseInt(pat.surface, 10);
                            if (!isNaN(targetSid)) {
                                const patX = (pat.x || 0);
                                const patY = (pat.y || 0);
                                const childElements = flattenSurface(targetSid, xOffset + patX, yOffset + patY, depth + 1, excludeAnimId, overrides);
                                elements = elements.concat(childElements);
                            }
                        }
                    }
                }
            }
            return elements;
        };

        // Helper to collect animations (Standard)
        const collectAnimations = (sid, collected = {}, depth = 0) => {
            if (depth > 10) return;
            if (!surfaces[sid]) return;

            if (surfaces[sid].animations) {
                for (const [id, anim] of Object.entries(surfaces[sid].animations)) {
                    collected[id] = { anim, ownerSid: sid };
                }
            }

            if (surfaces[sid].elements) {
                for (const el of surfaces[sid].elements) {
                    const targetSid = parseInt(el.file, 10);
                    if (!isNaN(targetSid)) {
                        collectAnimations(targetSid, collected, depth + 1);
                    }
                }
            }

            if (surfaces[sid].animations) {
                for (const animId of Object.keys(surfaces[sid].animations)) {
                    const anim = surfaces[sid].animations[animId];
                    let shouldRecurse = false;
                    if (anim.interval.includes('always')) shouldRecurse = true;
                    else if (anim.interval.includes('bind')) {
                        if (enabledBindIds && enabledBindIds.includes(parseInt(animId))) shouldRecurse = true;
                    }

                    if (shouldRecurse && anim.patterns && anim.patterns.length > 0) {
                        const targetSid = parseInt(anim.patterns[0].surface, 10);
                        if (!isNaN(targetSid)) {
                            collectAnimations(targetSid, collected, depth + 1);
                        }
                    }
                }
            }
            return collected;
        };

        // Re-process surfaces
        const modelPath = path.join(installDir, 'model.json');
        const modelData = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
        const mapping = modelData.mapping;

        // We only need to update the base files for each mapped emotion
        // AND re-generate 'talk'/'blink' frames if they depend on binds.

        // Strategy: Iterate MAPPING, find unique SIDs, re-render base and anims.
        const processedBuffers = {};

        for (const [mapKey, stylev1] of Object.entries(mapping)) {
            // stylev1: { base: 'surface0.png', mouthOpen: '...', ... }
            // Extract SID from base filename
            const match = stylev1.base.match(/surface(\d+)\.png/);
            if (!match) continue;

            const sid = parseInt(match[1], 10);

            if (!processedBuffers[sid]) {
                // Flatten Base (Implicit checking included)
                const flatElements = flattenSurface(sid, 0, 0, 0);

                if (flatElements.length > 0) {
                    const compositeDef = { elements: flatElements };
                    const buffer = await surfaceCompositor.composeSurface(shellDir, compositeDef);
                    processedBuffers[sid] = buffer;
                }
            }

            // Save base file (Overwriting existing)
            if (processedBuffers[sid]) {
                const outPath = path.join(installDir, stylev1.base);
                fs.writeFileSync(outPath, processedBuffers[sid]);
            }

            // Re-render animations (Blink/Talk)
            // We need to re-run the "Generation" logic from convertAndInstall basically.
            // But simpler: we know which files `stylev1` points to.
            // Actually, the filenames are baked in model.json.
            // If we change costumes, the 'mouthOpen' image content MIGHT change (if costume covers mouth?).
            // So we must re-generate `surface0_talk_11100_v1.png`.

            const allAnimations = collectAnimations(sid);

            // Special handling: Inject missing default binds if they are NOT in allAnimations?
            // No, collectAnimations uses enabledBindIds.
            // So allAnimations contains what is currently active.

            if (allAnimations) {
                for (const [animIdStr, { anim, ownerSid }] of Object.entries(allAnimations)) {
                    const animId = parseInt(animIdStr, 10);
                    // Detect type
                    let type = null;
                    if (anim.interval.includes('talk')) {
                        // Check heuristic (same as convertAndInstall)
                        // For now assume simple logic: if it was mapped, we regenerate it.
                        type = 'talk';
                    } else if (anim.interval.includes('blink')) {
                        type = 'blink';
                    }

                    if (type) {
                        // Generate
                        const numericAnimId = animId; // already int

                        // Determine Override
                        const overrides = {};
                        overrides[ownerSid] = ownerSid; // Self mapped? No.
                        // Logic from convertAndInstall:
                        // const overrides = {}; overrides[ownerSid] = targetSid;
                        if (anim.patterns && anim.patterns.length > 0) {
                            const pat = anim.patterns[0];
                            const targetSid = parseInt(pat.surface, 10);

                            if (!isNaN(targetSid)) {
                                overrides[ownerSid] = targetSid;

                                // Re-compose Frame
                                // 1. Base (with override)
                                const baseElements = flattenSurface(sid, 0, 0, 0, numericAnimId, overrides);
                                // 2. Pattern (Overlay)
                                const patElements = flattenSurface(targetSid, (pat.x || 0), (pat.y || 0), 0);

                                const frameBufferElements = baseElements.concat(patElements);
                                const frameBuffer = await surfaceCompositor.composeSurface(shellDir, { elements: frameBufferElements });

                                // Construct filename expected by model.json
                                // We loop 0..9?
                                // model.json has: "mouthOpen": "surface0_talk_11100_v1.png"
                                // We just overwrite that file.
                                const frameName = `surface${sid}_${type}_${numericAnimId}_v1.png`;
                                fs.writeFileSync(path.join(installDir, frameName), frameBuffer);
                            }
                        }
                    }
                }
            }
        }

        console.log(`[UkagakaAvatarAdapter] Recomposition complete.`);
        return true;
    }
}

module.exports = UkagakaAvatarAdapter;

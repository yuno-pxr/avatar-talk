const packageLoader = require('./electron/ukagaka/UkagakaPackageLoader.cjs');
const surfacesParser = require('./electron/ukagaka/SurfacesParser.cjs');
const descriptParser = require('./electron/ukagaka/DescriptParser.cjs');
const path = require('path');
const fs = require('fs');

async function runTest() {
    const narPath = 'src/assets/sample_ghost/shizuku.nar';
    const extractPath = 'src/assets/sample_ghost/extracted';

    console.log('--- Step 1: Loading Package ---');
    const UkagakaPackageLoader = require('./electron/ukagaka/UkagakaPackageLoader.cjs');
    const loader = new UkagakaPackageLoader();
    const structure = await loader.loadPackage(narPath, extractPath);
    console.log('Structure:', JSON.stringify(structure, null, 2));

    if (structure.shellDirs.length === 0) {
        console.error('No shell directories found!');
        return;
    }

    const shellDir = structure.shellDirs[0];
    console.log(`\n--- Step 2: Analyzing Shell at ${shellDir} ---`);

    const descriptPath = path.join(shellDir, 'descript.txt');
    console.log(`Reading descript.txt from ${descriptPath}`);
    const descript = descriptParser.parseFile(descriptPath);
    console.log('Shell Info (Summary):', {
        name: descript['name'],
        type: descript['type'],
        craftman: descript['craftman']
    });

    console.log(`\n--- Step 3: Parsing surfaces from ${shellDir} ---`);

    // 2. Parse Surfaces
    const surfacesData = await surfacesParser.parseDirectory(shellDir);
    const surfaces = surfacesData.surfaces;

    console.log('Parser Settings:', surfacesData.settings);
    console.log(`Parsed ${Object.keys(surfaces).length} surfaces.`);

    // DEBUG: Inspect Surface 0
    if (surfaces[0]) {
        console.log('--- Surface 0 Structure ---');
        console.log(JSON.stringify(surfaces[0], null, 2));
        console.log('---------------------------');
    } else {
        console.error('Surface 0 NOT FOUND');
    }

    // Check specifically for collisions
    let collisionCount = 0;
    let animCount = 0;
    const ids = Object.keys(surfaces); // Use 'surfaces' instead of 'surfacesData.surfaces' or undefined 'ids'
    ids.forEach(id => {
        collisionCount += surfaces[id].collisions.length;
        animCount += Object.keys(surfaces[id].animations).length;
    });
    console.log(`Total Collisions detected: ${collisionCount}`);
    console.log(`Total Animations detected: ${animCount}`);

    // --- Step 4: Conversion ---
    console.log(`\n--- Step 4: Converting using UkagakaAvatarAdapter ---`);
    const UkagakaAvatarAdapter = require('./electron/ukagaka/UkagakaAvatarAdapter.cjs');

    // Create instance
    const adapter = new UkagakaAvatarAdapter(path.join(__dirname, 'test_avatar_cache'));

    try {
        const avatarId = await adapter.convertAndInstall(extractPath, shellDir);
        console.log(`Conversion Success! Avatar ID: ${avatarId}`);
        const testCachePath = path.join(__dirname, 'test_avatar_cache');
        console.log(`Check directory: ${path.join(testCachePath, avatarId)}`);

        // Verify output
        const modelJsonPath = path.join(testCachePath, avatarId, 'model.json');
        if (fs.existsSync(modelJsonPath)) {
            console.log('model.json exists.');
            const modelData = JSON.parse(fs.readFileSync(modelJsonPath));

            // Check mapping
            if (modelData.mapping) {
                console.log('Mapping keys:', Object.keys(modelData.mapping));

                // Check blink (eyesClosed)
                const neutralMap = modelData.mapping['idle.neutral'];
                if (neutralMap) {
                    console.log('Neutral map:', neutralMap);
                    if (neutralMap.eyesClosed) {
                        console.log('Blink (eyesClosed) FOUND!');
                    } else {
                        console.warn('Blink (eyesClosed) NOT found in neutral map.');
                    }
                    if (neutralMap.mouthOpen) {
                        console.log('Talk (mouthOpen) FOUND!');
                    } else {
                        console.warn('Talk (mouthOpen) NOT found in neutral map.');
                    }
                }
            } else {
                console.error('No mapping found in model.json');
            }

            // Check styles
            if (modelData.styles) {
                console.log('Styles found:', modelData.styles.map(s => s.name));

                // Check blink animations
                const neutralStyle = modelData.styles.find(s => s.name === 'idle.neutral');
                if (neutralStyle && neutralStyle.animations && neutralStyle.animations.blink) {
                    console.log('Blink animation found for neutral!', neutralStyle.animations.blink.length, 'frames');
                } else {
                    console.warn('No blink animation found for neutral.');
                }
            } else {
                console.error('No styles found in model.json');
            }
        } else {
            console.error('model.json MISSING!');
        }

    } catch (e) {
        console.error('Conversion failed:', e);
    }
}

runTest().catch(console.error);

const { Jimp } = require('jimp');
const path = require('path');
const fs = require('fs');

class SurfaceCompositor {
    /**
     * Composites a surface definition into a single image buffer.
     * @param {string} shellDir - Base directory of the shell
     * @param {Object} surfaceDef - Surface definition from SurfacesParser (elements array)
     * @returns {Promise<Buffer>} - PNG Buffer
     */
    async composeSurface(shellDir, surfaceDef) {
        if (!surfaceDef || !surfaceDef.elements || surfaceDef.elements.length === 0) {
            throw new Error('Invalid surface definition');
        }

        // Sort elements by ID mostly, but typically they are already ordered by parser
        // Ukagaka spec implies order of definition matters.
        const elements = surfaceDef.elements;

        // 1. Determine canvas size from the generic base (usually first element or specific base element)
        // We'll load the first element to establish base size
        // TODO: Handle 'base' method specifically? Usually element0 is base.

        let baseImage = null;

        try {
            for (const elem of elements) {
                const imgPath = path.join(shellDir, elem.file);
                if (!fs.existsSync(imgPath)) {
                    console.warn(`[SurfaceCompositor] Image not found: ${elem.file}`);
                    continue;
                }

                const img = await Jimp.read(imgPath);

                if (!baseImage) {
                    // Initialize base canvas
                    // If the first element is offset, strictly the canvas might need to be larger?
                    // Ukagaka specs are complex here. Usually surface0.png defines the size.
                    // We will just use the first image's dimensions as the canvas for now,
                    // or maybe expand if offset is negative?
                    // Initialize base canvas
                    const w = img.bitmap.width;
                    const h = img.bitmap.height;
                    console.log(`[SurfaceCompositor] Creating base canvas: ${w}x${h}`);

                    // Jimp v1+ might accept object
                    baseImage = new Jimp({ width: w, height: h });

                    // If first method is 'base' or 'overlay', just draw it?
                    // Actually, usually we start with transparent canvas and composite onto it.
                    // But if element0 is the body, we want its size.

                    // Let's resize baseImage if subsequent elements go out of bounds? 
                    // No, Ukagaka shells usually fit in the base surface size.
                }

                // Composition Method
                // 'base': Standard drawing (overwrite?)
                // 'overlay': Alpha blending
                // 'overlayfast': ...
                // 'replace': ...

                // Jimp composite modes:
                // JIMP.BLEND_SOURCE_OVER (default)

                // Handle offsets
                const x = elem.x || 0;
                const y = elem.y || 0;

                if (elem.method === 'base' || elem.method === 'overlay') {
                    baseImage.composite(img, x, y, {
                        mode: Jimp.BLEND_SOURCE_OVER,
                        opacitySource: 1.0,
                        opacityDest: 1.0
                    });
                } else if (elem.method === 'replace') {
                    // Clear the area first? or just overwrite?
                    // Jimp doesn't have direct 'replace' without alpha blending if src has alpha...
                    // But composite usually blends.
                    // For MVP, treat everything as overlay.
                    baseImage.composite(img, x, y);
                } else {
                    // Fallback
                    baseImage.composite(img, x, y);
                }
            }

            if (!baseImage) {
                throw new Error('No valid images found to composite');
            }

            console.log('[SurfaceCompositor] Getting buffer (Promise mode)...');
            // Try await directly
            return await baseImage.getBuffer('image/png');
        } catch (e) {
            console.error('[SurfaceCompositor] Composition error:', e);
            throw e;
        }
    }
}

module.exports = new SurfaceCompositor();

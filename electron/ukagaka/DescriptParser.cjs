const fs = require('fs');
const iconv = require('iconv-lite');

class DescriptParser {
    /**
     * Parses a descript.txt file.
     * @param {string} filePath 
     * @returns {Object} Key-value pairs
     */
    parseFile(filePath) {
        try {
            if (!fs.existsSync(filePath)) return {};
            const buffer = fs.readFileSync(filePath);
            const content = iconv.decode(buffer, 'Shift_JIS');
            return this.parseContent(content);
        } catch (e) {
            console.error('Error parsing descript.txt:', e);
            return {};
        }
    }

    parseContent(content) {
        const lines = content.split(/\r?\n/);
        const data = {};
        const defaults = [];

        for (let line of lines) {
            line = line.trim();
            if (!line || line.startsWith('//')) continue;

            const commaIndex = line.indexOf(',');
            if (commaIndex === -1) continue;

            const key = line.substring(0, commaIndex).trim();
            const val = line.substring(commaIndex + 1).trim();

            if (key && val) {
                data[key.toLowerCase()] = val;

                // Check for default binds
                const match = key.match(/sakura\.bindgroup(\d+)\.default/i);
                if (match && val === '1') {
                    defaults.push(parseInt(match[1], 10));
                }
            }
        }


        // Parse Bind Groups (Costumes)
        const bindGroups = {};
        for (const [key, val] of Object.entries(data)) {
            // sakura.bindgroup20.name
            const nameMatch = key.match(/sakura\.bindgroup(\d+)\.name/i);
            if (nameMatch) {
                const id = parseInt(nameMatch[1], 10);
                if (!bindGroups[id]) bindGroups[id] = { id: id, default: false };
                bindGroups[id].name = val;
            }

            // sakura.bindgroup20.default
            const defMatch = key.match(/sakura\.bindgroup(\d+)\.default/i);
            if (defMatch) {
                const id = parseInt(defMatch[1], 10);
                if (!bindGroups[id]) bindGroups[id] = { id: id, name: `Costume ${id}` };
                bindGroups[id].default = (val === '1');
            }
        }

        const costumes = Object.values(bindGroups).map(bg => ({
            id: bg.id,
            name: bg.name || `Costume ${bg.id}`,
            category: 'Costume',
            default: bg.default
        }));

        data['_defaults'] = defaults;
        data['_costumes'] = costumes;
        return data;
    }
}

module.exports = new DescriptParser();

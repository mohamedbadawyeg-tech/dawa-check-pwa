const JimpModule = require('jimp');
const Jimp = JimpModule.Jimp || JimpModule.default || JimpModule;
const path = require('path');
const fs = require('fs');

const SOURCE_FILE = 'icons/source_icon.png';
const OUTPUT_DIR = 'icons';

async function generateIcons() {
    if (!fs.existsSync(SOURCE_FILE)) {
        console.error(`Error: Source file '${SOURCE_FILE}' not found. Please save your image as '${SOURCE_FILE}' in the root directory.`);
        process.exit(1);
    }

    try {
        console.log(`Reading source image from ${SOURCE_FILE}...`);
        const image = await Jimp.read(SOURCE_FILE);

        // Helper to write file
        const writeFile = async (img, filePath) => {
            if (img.writeAsync) {
                await img.writeAsync(filePath);
            } else {
                const mime = 'image/png';
                const buffer = await img.getBuffer(mime);
                await fs.promises.writeFile(filePath, buffer);
            }
        };

        // Generate 512x512
        const icon512 = image.clone().resize({ w: 512, h: 512 });
        await writeFile(icon512, path.join(OUTPUT_DIR, 'sehaty-512.png'));
        console.log('✅ Generated icons/sehaty-512.png');

        // Generate 192x192
        const icon192 = image.clone().resize({ w: 192, h: 192 });
        await writeFile(icon192, path.join(OUTPUT_DIR, 'sehaty-192.png'));
        console.log('✅ Generated icons/sehaty-192.png');

    } catch (error) {
        console.error('Error generating icons:', error.message || error);
    }
}

generateIcons();

const JimpModule = require('jimp');
console.log('Jimp exports:', Object.keys(JimpModule));

// Try to find the correct entry point
const Jimp = JimpModule.Jimp || JimpModule.default || JimpModule;

const path = require('path');

const SOURCE_ICON = 'icons/sehaty-512.png';
const BASE_PATH = 'android/app/src/main/res';

const SIZES = [
    { folder: 'mipmap-mdpi', size: 48 },
    { folder: 'mipmap-hdpi', size: 72 },
    { folder: 'mipmap-xhdpi', size: 96 },
    { folder: 'mipmap-xxhdpi', size: 144 },
    { folder: 'mipmap-xxxhdpi', size: 192 }
];

async function updateIcons() {
    try {
        console.log(`Reading source icon from ${SOURCE_ICON}...`);
        const image = await Jimp.read(SOURCE_ICON);
        console.log('Image loaded. Methods:', Object.keys(image));

        for (const config of SIZES) {
            const size = config.size;
            const folder = config.folder;
            
const fs = require('fs').promises;

// ...

            console.log(`Resizing to ${size}x${size} for ${folder}...`);
            const resized = image.clone();
            resized.resize({ w: size, h: size }); 
            
            const targetDir = path.join(BASE_PATH, folder);
            
            // Update ic_launcher.png
            const launcherPath = path.join(targetDir, 'ic_launcher.png');
            // Check if writeAsync exists
            if (resized.writeAsync) {
                await resized.writeAsync(launcherPath);
            } else {
                 // Fallback to getBuffer + fs
                 const mime = 'image/png';
                 const buffer = await resized.getBuffer(mime);
                 await fs.writeFile(launcherPath, buffer);
            }
            console.log(`Written ${launcherPath}`);
            
            // Update ic_launcher_round.png
            const roundPath = path.join(targetDir, 'ic_launcher_round.png');
            if (resized.writeAsync) {
                await resized.writeAsync(roundPath);
            } else {
                 const buffer = await resized.getBuffer('image/png');
                 await fs.writeFile(roundPath, buffer);
            }
            console.log(`Written ${roundPath}`);

             // Update ic_launcher_foreground.png (just in case)
            const foregroundPath = path.join(targetDir, 'ic_launcher_foreground.png');
            if (resized.writeAsync) {
                await resized.writeAsync(foregroundPath);
            } else {
                 const buffer = await resized.getBuffer('image/png');
                 await fs.writeFile(foregroundPath, buffer);
            }
            console.log(`Written ${foregroundPath}`);

             // Update ic_notification.png
            const notificationPath = path.join(targetDir, 'ic_notification.png');
            if (resized.writeAsync) {
                await resized.writeAsync(notificationPath);
            } else {
                 const buffer = await resized.getBuffer('image/png');
                 await fs.writeFile(notificationPath, buffer);
            }
            console.log(`Written ${notificationPath}`);
        }
        
        console.log('All icons updated successfully!');
    } catch (error) {
        console.error('Error updating icons:', error.message);
        process.exit(1);
    }
}

updateIcons();

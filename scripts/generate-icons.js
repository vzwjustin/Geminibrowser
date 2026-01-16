/**
 * Icon Generator Script
 * Generates PNG icons from SVG for Chrome extension
 *
 * Usage: node scripts/generate-icons.js
 * Requires: npm install sharp
 */

const fs = require('fs');
const path = require('path');

// Try to use sharp if available, otherwise create placeholder PNGs
async function generateIcons() {
  const sizes = [16, 32, 48, 128];
  const iconsDir = path.join(__dirname, '..', 'icons');
  const svgPath = path.join(iconsDir, 'icon.svg');

  try {
    const sharp = require('sharp');
    const svgBuffer = fs.readFileSync(svgPath);

    for (const size of sizes) {
      await sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(path.join(iconsDir, `icon${size}.png`));

      console.log(`Generated icon${size}.png`);
    }

    console.log('All icons generated successfully!');
  } catch (e) {
    console.log('Sharp not available, creating placeholder icons...');
    createPlaceholderIcons(sizes, iconsDir);
  }
}

function createPlaceholderIcons(sizes, iconsDir) {
  // Create minimal valid PNG files (1x1 purple pixel, will be stretched)
  // This is a workaround - for production, use proper icon generation

  for (const size of sizes) {
    const pngPath = path.join(iconsDir, `icon${size}.png`);

    // Minimal PNG header + IHDR + IDAT + IEND for a purple pixel
    // This creates a valid but minimal PNG that Chrome will accept
    const png = createMinimalPNG(size);
    fs.writeFileSync(pngPath, png);
    console.log(`Created placeholder icon${size}.png`);
  }

  console.log('\\nNote: For better icons, install sharp and run this script again:');
  console.log('  npm install sharp');
  console.log('  node scripts/generate-icons.js');
}

function createMinimalPNG(size) {
  // Creates a minimal valid PNG with a gradient-like purple color
  const { createCanvas } = tryRequireCanvas();

  if (createCanvas) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#667eea');
    gradient.addColorStop(1, '#764ba2');

    // Draw rounded rectangle
    const radius = size * 0.1875; // 24/128 ratio
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, radius);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw simple Gemini-like symbol
    ctx.fillStyle = 'white';
    const centerX = size / 2;
    const centerY = size / 2;
    const scale = size / 128;

    // Top circle
    ctx.beginPath();
    ctx.arc(centerX, 48 * scale, 16 * scale, 0, Math.PI * 2);
    ctx.fill();

    // Diamond
    ctx.beginPath();
    ctx.moveTo(40 * scale, 80 * scale);
    ctx.lineTo(centerX, 56 * scale);
    ctx.lineTo(88 * scale, 80 * scale);
    ctx.lineTo(centerX, 104 * scale);
    ctx.closePath();
    ctx.fill();

    // Side circles
    ctx.beginPath();
    ctx.arc(40 * scale, 80 * scale, 8 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(88 * scale, 80 * scale, 8 * scale, 0, Math.PI * 2);
    ctx.fill();

    return canvas.toBuffer('image/png');
  }

  // Fallback: create a simple solid color PNG manually
  return createSimplePNG(size);
}

function tryRequireCanvas() {
  try {
    return require('canvas');
  } catch (e) {
    return { createCanvas: null };
  }
}

function createSimplePNG(size) {
  // Manual PNG creation for a solid purple square
  // This is a minimal valid PNG structure

  const crc32 = (data) => {
    let crc = 0xffffffff;
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c;
    }
    for (let i = 0; i < data.length; i++) {
      crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };

  const chunks = [];

  // PNG signature
  chunks.push(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);  // width
  ihdr.writeUInt32BE(size, 4);  // height
  ihdr.writeUInt8(8, 8);        // bit depth
  ihdr.writeUInt8(2, 9);        // color type (RGB)
  ihdr.writeUInt8(0, 10);       // compression
  ihdr.writeUInt8(0, 11);       // filter
  ihdr.writeUInt8(0, 12);       // interlace

  const ihdrChunk = Buffer.alloc(12 + ihdr.length);
  ihdrChunk.writeUInt32BE(ihdr.length, 0);
  ihdrChunk.write('IHDR', 4);
  ihdr.copy(ihdrChunk, 8);
  ihdrChunk.writeUInt32BE(crc32(ihdrChunk.slice(4, 8 + ihdr.length)), 8 + ihdr.length);
  chunks.push(ihdrChunk);

  // IDAT chunk (image data)
  const zlib = require('zlib');
  const rawData = Buffer.alloc(size * (1 + size * 3)); // filter byte + RGB per pixel per row

  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 3);
    rawData[rowStart] = 0; // filter type: none

    for (let x = 0; x < size; x++) {
      const pixelStart = rowStart + 1 + x * 3;
      // Gradient from #667eea to #764ba2
      const t = (x + y) / (2 * size);
      rawData[pixelStart] = Math.round(0x66 + (0x76 - 0x66) * t);     // R
      rawData[pixelStart + 1] = Math.round(0x7e + (0x4b - 0x7e) * t); // G
      rawData[pixelStart + 2] = Math.round(0xea + (0xa2 - 0xea) * t); // B
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = Buffer.alloc(12 + compressed.length);
  idatChunk.writeUInt32BE(compressed.length, 0);
  idatChunk.write('IDAT', 4);
  compressed.copy(idatChunk, 8);
  idatChunk.writeUInt32BE(crc32(idatChunk.slice(4, 8 + compressed.length)), 8 + compressed.length);
  chunks.push(idatChunk);

  // IEND chunk
  const iendChunk = Buffer.alloc(12);
  iendChunk.writeUInt32BE(0, 0);
  iendChunk.write('IEND', 4);
  iendChunk.writeUInt32BE(crc32(iendChunk.slice(4, 8)), 8);
  chunks.push(iendChunk);

  return Buffer.concat(chunks);
}

generateIcons().catch(console.error);

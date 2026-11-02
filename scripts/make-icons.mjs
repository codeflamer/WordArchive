// Draws the app icons (a pale bookmark on plum) as PNGs, with no image tools needed.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync, crc32 } from "node:zlib";

const PLUM = [111, 39, 71];
const PAPER = [238, 241, 230];

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function icon(size) {
  const left = size * 0.34;
  const right = size * 0.66;
  const start = size * 0.18;
  const end = size * 0.82;
  const notch = size * 0.14;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [0];
    for (let x = 0; x < size; x++) {
      const inBand = x >= left && x < right && y >= start && y < end;
      const inNotch = y > end - notch && y - (end - notch) > (Math.abs(x - size / 2) / (size * 0.16)) * notch;
      row.push(...(inBand && !inNotch ? PAPER : PLUM));
    }
    rows.push(Buffer.from(row));
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync("public", { recursive: true });
writeFileSync("public/apple-touch-icon.png", icon(180));
writeFileSync("public/icon-192.png", icon(192));
writeFileSync("public/icon-512.png", icon(512));

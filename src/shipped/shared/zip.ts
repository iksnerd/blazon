// A zip file, written by hand, for the plugins that ship one (an Office file is one, and so is a press kit): the same files must give the
// same bytes. Entries are stored, not compressed (a compressor's output can change with the Node that runs it), and each carries the same
// date, 2000-01-01, so nothing about the computer or the hour gets in.

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** 2000-01-01 00:00:00 as a DOS date: years since 1980 in the top seven bits, then month, then day */
const DOS_DATE = ((2000 - 1980) << 9) | (1 << 5) | 1;

export type Entry = [name: string, data: Buffer | string];

/** The entries as a zip file, in the order given. A name is plain ASCII: the callers make theirs so. */
export function zipOf(entries: Entry[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const body = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf-8');
    const label = Buffer.from(name, 'ascii');
    const crc = crc32(body);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(label.length, 26);
    parts.push(local, label, body);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4); // version made by
    local.copy(entry, 6, 4, 30); // version needed .. name length are the same fields
    entry.writeUInt32LE(offset, 42);
    central.push(entry, label);
    offset += local.length + label.length + body.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}

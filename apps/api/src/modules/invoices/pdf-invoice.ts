/**
 * pdf-invoice.ts — Bộ sinh PDF tối giản, KHÔNG dùng thư viện ngoài.
 *
 * Font: DejaVu Sans / DejaVu Sans Bold (thư mục ./assets) — bộ font DejaVu được
 * phát hành theo DejaVu Fonts License (giấy phép tự do, cho phép nhúng & phân
 * phối lại; nguồn gốc: /usr/share/fonts/truetype/dejavu trên Debian/Ubuntu).
 *
 * Cách hoạt động:
 *  - Parse bảng `cmap` (format 4 & 12) + `hmtx` của TTF để ánh xạ Unicode →
 *    glyphId + độ rộng glyph.
 *  - Nhúng font dạng CIDFontType2 (Identity-H) + ToUnicode CMap → chữ tiếng
 *    Việt hiển thị đúng VÀ trích xuất (copy/search) đúng từ file PDF.
 *  - Content stream vẽ text bằng BT/ET + Tf + Tm + Tj (hex 2-byte/glyph),
 *    vẽ bảng bằng hình chữ nhật (re f).
 *
 * API dùng bởi InvoicesService: registerFont → drawText/drawRect/drawLine →
 * build(). Tọa độ truyền vào theo hệ "gốc trên-trái" giống canvas cho dễ layout
 * (y tăng dần xuống dưới); nội bộ tự đổi sang hệ PDF (gốc dưới-trái).
 */
import * as zlib from 'zlib';

// ─── TTF parsing ─────────────────────────────────────────────────────────────

export interface TtfFont {
  unitsPerEm: number;
  numGlyphs: number;
  bbox: [number, number, number, number];
  capHeight: number;
  cmap: Map<number, number>; // codepoint -> glyphId
  advances: number[]; // glyphId -> advance width (font units)
}

function u16(buf: Buffer, off: number): number {
  return buf.readUInt16BE(off);
}
function i16(buf: Buffer, off: number): number {
  return buf.readInt16BE(off);
}
function u32(buf: Buffer, off: number): number {
  return buf.readUInt32BE(off);
}

export function parseTtf(buf: Buffer): TtfFont {
  const numTables = u16(buf, 4);
  const tables = new Map<string, { offset: number; length: number }>();
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const tag = buf.toString('ascii', rec, rec + 4);
    tables.set(tag, { offset: u32(buf, rec + 8), length: u32(buf, rec + 12) });
  }
  const table = (tag: string) => {
    const t = tables.get(tag);
    if (!t) throw new Error(`TTF thiếu bảng ${tag}`);
    return t;
  };

  const head = table('head');
  const unitsPerEm = u16(buf, head.offset + 18);
  const bbox: [number, number, number, number] = [
    i16(buf, head.offset + 36),
    i16(buf, head.offset + 38),
    i16(buf, head.offset + 40),
    i16(buf, head.offset + 42),
  ];
  const maxp = table('maxp');
  const numGlyphs = u16(buf, maxp.offset + 4);

  let capHeight = 700;
  const os2 = tables.get('OS/2');
  if (os2 && os2.length > 66) capHeight = i16(buf, os2.offset + 64) || 700;

  // hmtx: advance widths
  const hhea = table('hhea');
  const numberOfHMetrics = u16(buf, hhea.offset + 34);
  const hmtx = table('hmtx');
  const advances: number[] = new Array(numGlyphs).fill(0);
  let lastAdvance = 0;
  for (let g = 0; g < numGlyphs; g++) {
    if (g < numberOfHMetrics) lastAdvance = u16(buf, hmtx.offset + g * 4);
    advances[g] = lastAdvance;
  }

  // cmap: ưu tiên format 12, fallback format 4
  const cmapTable = table('cmap');
  const numSubtables = u16(buf, cmapTable.offset + 2);
  let fmt12Offset = -1;
  let fmt4Offset = -1;
  for (let i = 0; i < numSubtables; i++) {
    const rec = cmapTable.offset + 4 + i * 8;
    const subOffset = cmapTable.offset + u32(buf, rec + 4);
    const format = u16(buf, subOffset);
    if (format === 12 && fmt12Offset < 0) fmt12Offset = subOffset;
    if (format === 4 && fmt4Offset < 0) fmt4Offset = subOffset;
  }
  const cmap = new Map<number, number>();
  if (fmt12Offset >= 0) {
    const nGroups = u32(buf, fmt12Offset + 12);
    for (let g = 0; g < nGroups; g++) {
      const rec = fmt12Offset + 16 + g * 12;
      const startChar = u32(buf, rec);
      const endChar = u32(buf, rec + 4);
      const startGlyph = u32(buf, rec + 8);
      for (let c = startChar; c <= endChar; c++) {
        cmap.set(c, startGlyph + (c - startChar));
      }
    }
  } else if (fmt4Offset >= 0) {
    const segCount = u16(buf, fmt4Offset + 6) / 2;
    const endCodes = fmt4Offset + 14;
    const startCodes = endCodes + 2 * segCount + 2;
    const idDeltas = startCodes + 2 * segCount;
    const idRangeOffsets = idDeltas + 2 * segCount;
    for (let s = 0; s < segCount; s++) {
      const endCode = u16(buf, endCodes + s * 2);
      const startCode = u16(buf, startCodes + s * 2);
      const delta = i16(buf, idDeltas + s * 2);
      const rangeOffset = u16(buf, idRangeOffsets + s * 2);
      if (startCode === 0xffff && endCode === 0xffff) continue;
      for (let c = startCode; c <= endCode; c++) {
        let gid = 0;
        if (rangeOffset === 0) {
          gid = (c + delta) & 0xffff;
        } else {
          const glyphIndexAddress = idRangeOffsets + s * 2 + rangeOffset + 2 * (c - startCode);
          gid = u16(buf, glyphIndexAddress);
          if (gid !== 0) gid = (gid + delta) & 0xffff;
        }
        if (gid !== 0) cmap.set(c, gid);
      }
    }
  } else {
    throw new Error('TTF không có cmap format 4/12');
  }

  return { unitsPerEm, numGlyphs, bbox, capHeight, cmap, advances };
}

// ─── PDF builder ─────────────────────────────────────────────────────────────

interface RegisteredFont {
  key: string; // tên tài nguyên trong PDF: F1, F2, ...
  baseName: string; // /BaseFont
  raw: Buffer;
  ttf: TtfFont;
}

export interface DrawTextOptions {
  font?: string; // key đã registerFont, mặc định font đầu tiên
  size?: number;
  color?: [number, number, number]; // 0..1
}

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;

export class PdfBuilder {
  private fonts: RegisteredFont[] = [];
  private ops: string[] = [];
  /** fontKey -> (glyphId -> codepoint) các glyph thực sự dùng trong tài liệu */
  private usedGlyphs = new Map<string, Map<number, number>>();

  registerFont(key: string, baseName: string, raw: Buffer): void {
    this.fonts.push({ key, baseName, raw, ttf: parseTtf(raw) });
    this.usedGlyphs.set(key, new Map());
  }

  private fontByKey(key?: string): RegisteredFont {
    const f = key ? this.fonts.find(x => x.key === key) : this.fonts[0];
    if (!f) throw new Error(`Chưa đăng ký font ${key ?? ''}`);
    return f;
  }

  /** Độ rộng chuỗi (đơn vị PDF pt) — dùng để căn phải / căn giữa */
  textWidth(text: string, fontKey: string | undefined, size: number): number {
    const font = this.fontByKey(fontKey);
    let units = 0;
    for (const ch of text) {
      const gid = this.glyphId(font, ch.codePointAt(0) ?? 0);
      units += font.ttf.advances[gid] ?? 0;
    }
    return (units / font.ttf.unitsPerEm) * size;
  }

  private glyphId(font: RegisteredFont, codepoint: number): number {
    const direct = font.ttf.cmap.get(codepoint);
    if (direct !== undefined) return direct;
    // Fallback: dấu '?' nếu có, không thì .notdef (0)
    return font.ttf.cmap.get(0x3f) ?? 0;
  }

  /**
   * Vẽ 1 dòng text. (x, y) = điểm bắt đầu của baseline, y tính TỪ TRÊN xuống.
   */
  drawText(x: number, y: number, text: string, opts: DrawTextOptions = {}): void {
    const font = this.fontByKey(opts.font);
    const size = opts.size ?? 11;
    const [r, g, b] = opts.color ?? [0, 0, 0];
    const used = this.usedGlyphs.get(font.key)!;
    let hex = '';
    for (const ch of text) {
      const cp = ch.codePointAt(0) ?? 0;
      const gid = this.glyphId(font, cp);
      if (!used.has(gid)) used.set(gid, cp);
      hex += gid.toString(16).padStart(4, '0');
    }
    const pdfY = PAGE_HEIGHT - y;
    this.ops.push(
      `BT /${font.key} ${size} Tf ${r} ${g} ${b} rg 1 0 0 1 ${round2(x)} ${round2(pdfY)} Tm <${hex}> Tj ET`,
    );
  }

  /** Hình chữ nhật đặc. (x, y) = góc trên-trái, y tính từ trên xuống. */
  drawRect(
    x: number,
    y: number,
    w: number,
    h: number,
    color: [number, number, number] = [0, 0, 0],
  ): void {
    const [r, g, b] = color;
    const pdfY = PAGE_HEIGHT - y - h;
    this.ops.push(`${r} ${g} ${b} rg ${round2(x)} ${round2(pdfY)} ${round2(w)} ${round2(h)} re f`);
  }

  /** Đường kẻ ngang. (x, y) tính từ trên xuống. */
  drawLine(
    x: number,
    y: number,
    w: number,
    thickness = 0.7,
    color: [number, number, number] = [0.6, 0.6, 0.6],
  ): void {
    this.drawRect(x, y, w, thickness, color);
  }

  build(): Buffer {
    // Object numbering: 1=Catalog 2=Pages, sau đó mỗi font 5 object, cuối: Page + Contents
    const chunks: Buffer[] = [];
    const offsets: number[] = [];
    let cursor = 0;
    const push = (data: string | Buffer) => {
      const b = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
      chunks.push(b);
      cursor += b.length;
    };
    const beginObj = (id: number) => {
      offsets[id] = cursor;
      push(`${id} 0 obj\n`);
    };
    const endObj = () => push('endobj\n');
    const streamObj = (id: number, dict: string, data: Buffer) => {
      beginObj(id);
      push(`<< ${dict} /Length ${data.length} >>\nstream\n`);
      push(data);
      push('\nendstream\n');
      endObj();
    };

    push('%PDF-1.6\n%\xe2\xe3\xcf\xd3\n');

    const fontObjIds = new Map<string, { type0: number }>();
    let nextId = 3;
    const fontObjects: {
      font: RegisteredFont;
      fileId: number;
      descId: number;
      cidId: number;
      type0Id: number;
      tuId: number;
    }[] = [];
    for (const font of this.fonts) {
      const ids = {
        font,
        fileId: nextId++,
        descId: nextId++,
        cidId: nextId++,
        type0Id: nextId++,
        tuId: nextId++,
      };
      fontObjects.push(ids);
      fontObjIds.set(font.key, { type0: ids.type0Id });
    }
    const pageId = nextId++;
    const contentId = nextId++;

    // 1: Catalog, 2: Pages
    beginObj(1);
    push('<< /Type /Catalog /Pages 2 0 R >>\n');
    endObj();
    beginObj(2);
    push(`<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>\n`);
    endObj();

    for (const { font, fileId, descId, cidId, type0Id, tuId } of fontObjects) {
      const { ttf } = font;
      const scale = 1000 / ttf.unitsPerEm;
      const used = this.usedGlyphs.get(font.key)!;
      const gids = [...used.keys()].sort((a, b) => a - b);

      // Font file (nén flate)
      streamObj(
        fileId,
        `/Length1 ${font.raw.length} /Filter /FlateDecode`,
        zlib.deflateSync(font.raw),
      );

      // FontDescriptor
      beginObj(descId);
      push(
        `<< /Type /FontDescriptor /FontName /${font.baseName} /Flags 4 ` +
          `/FontBBox [${Math.round(ttf.bbox[0] * scale)} ${Math.round(ttf.bbox[1] * scale)} ${Math.round(ttf.bbox[2] * scale)} ${Math.round(ttf.bbox[3] * scale)}] ` +
          `/ItalicAngle 0 /Ascent ${Math.round(ttf.bbox[3] * scale)} /Descent ${Math.round(ttf.bbox[1] * scale)} ` +
          `/CapHeight ${Math.round(ttf.capHeight * scale)} /StemV 80 /FontFile2 ${fileId} 0 R >>\n`,
      );
      endObj();

      // CIDFontType2 + bảng độ rộng cho các glyph đã dùng
      const wEntries = gids
        .map(gid => `${gid} [${Math.round((ttf.advances[gid] ?? 0) * scale)}]`)
        .join(' ');
      beginObj(cidId);
      push(
        `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${font.baseName} ` +
          `/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> ` +
          `/FontDescriptor ${descId} 0 R /DW 500 /W [${wEntries}] /CIDToGIDMap /Identity >>\n`,
      );
      endObj();

      // ToUnicode CMap (bfchar, tối đa 100 dòng / block)
      let tu = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n';
      tu += '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n';
      tu += '/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n';
      tu += '1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n';
      for (let i = 0; i < gids.length; i += 100) {
        const slice = gids.slice(i, i + 100);
        tu += `${slice.length} beginbfchar\n`;
        for (const gid of slice) {
          const cp = used.get(gid) ?? 0;
          const uni = Buffer.from(String.fromCodePoint(cp), 'utf16le')
            .swap16()
            .toString('hex')
            .padStart(4, '0');
          tu += `<${gid.toString(16).padStart(4, '0')}> <${uni}>\n`;
        }
        tu += 'endbfchar\n';
      }
      tu += 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n';
      streamObj(tuId, '/Filter /FlateDecode', zlib.deflateSync(Buffer.from(tu, 'utf8')));

      // Type0 font
      beginObj(type0Id);
      push(
        `<< /Type /Font /Subtype /Type0 /BaseFont /${font.baseName} /Encoding /Identity-H ` +
          `/DescendantFonts [${cidId} 0 R] /ToUnicode ${tuId} 0 R >>\n`,
      );
      endObj();
    }

    // Page
    const fontResources = this.fonts
      .map(f => `/${f.key} ${fontObjIds.get(f.key)!.type0} 0 R`)
      .join(' ');
    beginObj(pageId);
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << ${fontResources} >> >> /Contents ${contentId} 0 R >>\n`,
    );
    endObj();

    // Contents
    streamObj(
      contentId,
      '/Filter /FlateDecode',
      zlib.deflateSync(Buffer.from(this.ops.join('\n'), 'utf8')),
    );

    // xref + trailer
    const xrefOffset = cursor;
    const total = nextId;
    let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let id = 1; id < total; id++) {
      xref += `${String(offsets[id] ?? 0).padStart(10, '0')} 00000 n \n`;
    }
    xref += `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    push(xref);

    return Buffer.concat(chunks);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const PDF_PAGE = { width: PAGE_WIDTH, height: PAGE_HEIGHT } as const;

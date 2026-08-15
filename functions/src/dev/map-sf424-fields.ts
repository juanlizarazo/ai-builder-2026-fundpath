/**
 * Dev harness: walks the content streams of the bundled SF-424 base PDF and
 * prints every text-showing operator with the page-space (x, y) where it starts.
 *
 * The official SF-424 (`SF424_4_0-V4.0.pdf`) is an XFA dynamic PDF with zero
 * AcroForm field names, so pdf-lib cannot fill it. We instead overlay the
 * grants.gov *readonly* render (`assets/sf424-base.pdf`). To place values we
 * need a real label -> coordinate table; this script produces it by decoding
 * each page's content stream and tracking the text matrix (`Tm`/`Td`/`TD`/`T*`)
 * alongside the CTM (`cm`) so the printed coordinates are in the same space
 * pdf-lib's `page.drawText({ x, y })` uses.
 *
 * Usage:
 *   yarn dev:sf424-fields                 # every label on every page
 *   yarn dev:sf424-fields --page 0        # one page only
 *   yarn dev:sf424-fields --grep "Legal"  # only labels containing a substring
 */
import { PDFArray, PDFDocument, PDFRawStream, PDFStream, decodePDFRawStream } from 'pdf-lib';
import { SF424Helper, SF424_BASE_PDF_PATH } from '../application/sf424.helper';

interface ITextItem {
  page: number;
  x: number;
  y: number;
  size: number;
  text: string;
}

type Token = { type: 'operand'; value: string } | { type: 'operator'; value: string };

// ---- tokenizer -----------------------------------------------------------------

const WHITESPACE = new Set([' ', '\n', '\r', '\t', '\f', '\0']);
const DELIMITERS = new Set(['(', ')', '<', '>', '[', ']', '{', '}', '/', '%']);

function readLiteralString(source: string, start: number): { raw: string; next: number } {
  let depth = 0;
  let index = start;

  while (index < source.length) {
    const char = source[index];

    if (char === '\\') {
      index += 2;
      continue;
    }

    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;

      if (depth === 0) {
        return { raw: source.slice(start, index + 1), next: index + 1 };
      }
    }

    index += 1;
  }

  return { raw: source.slice(start), next: source.length };
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index];

    if (WHITESPACE.has(char)) {
      index += 1;
      continue;
    }

    if (char === '%') {
      while (index < source.length && source[index] !== '\n' && source[index] !== '\r') {
        index += 1;
      }
      continue;
    }

    if (char === '(') {
      const { raw, next } = readLiteralString(source, index);
      tokens.push({ type: 'operand', value: raw });
      index = next;
      continue;
    }

    if (char === '<' && source[index + 1] !== '<') {
      const end = source.indexOf('>', index);
      const stop = end === -1 ? source.length : end + 1;
      tokens.push({ type: 'operand', value: source.slice(index, stop) });
      index = stop;
      continue;
    }

    if (char === '<' || char === '>') {
      // dictionary delimiters — emit as operands so they never look like operators
      tokens.push({ type: 'operand', value: source.slice(index, index + 2) });
      index += 2;
      continue;
    }

    if (char === '[' || char === ']' || char === '{' || char === '}') {
      tokens.push({ type: 'operand', value: char });
      index += 1;
      continue;
    }

    if (char === '/') {
      let end = index + 1;

      while (end < source.length && !WHITESPACE.has(source[end]) && !DELIMITERS.has(source[end])) {
        end += 1;
      }

      tokens.push({ type: 'operand', value: source.slice(index, end) });
      index = end;
      continue;
    }

    let end = index;

    while (end < source.length && !WHITESPACE.has(source[end]) && !DELIMITERS.has(source[end])) {
      end += 1;
    }

    const word = source.slice(index, end === index ? index + 1 : end);
    index = end === index ? index + 1 : end;

    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) {
      tokens.push({ type: 'operand', value: word });
    } else {
      tokens.push({ type: 'operator', value: word });
    }
  }

  return tokens;
}

// ---- PDF string decoding --------------------------------------------------------

const ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };

function decodeLiteralString(raw: string): string {
  const body = raw.slice(1, -1);
  let out = '';
  let index = 0;

  while (index < body.length) {
    const char = body[index];

    if (char !== '\\') {
      out += char;
      index += 1;
      continue;
    }

    const next = body[index + 1];

    if (next === undefined) {
      break;
    }

    if (next >= '0' && next <= '7') {
      let digits = '';

      while (digits.length < 3 && body[index + 1 + digits.length] >= '0' && body[index + 1 + digits.length] <= '7') {
        digits += body[index + 1 + digits.length];
      }

      out += String.fromCharCode(parseInt(digits, 8));
      index += 1 + digits.length;
      continue;
    }

    if (next === '\n' || next === '\r') {
      index += 2;
      continue;
    }

    out += ESCAPES[next] ?? next;
    index += 2;
  }

  return out;
}

function decodeHexString(raw: string): string {
  const hex = raw.slice(1, -1).replace(/[^0-9a-fA-F]/g, '');
  let out = '';

  // These streams use single-byte fonts; two hex digits per glyph.
  for (let index = 0; index + 1 < hex.length; index += 2) {
    out += String.fromCharCode(parseInt(hex.slice(index, index + 2), 16));
  }

  return out;
}

function decodeStringOperand(raw: string): string {
  if (raw.startsWith('(')) {
    return decodeLiteralString(raw);
  }

  if (raw.startsWith('<') && !raw.startsWith('<<')) {
    return decodeHexString(raw);
  }

  return '';
}

// ---- content stream walk --------------------------------------------------------

function contentStringForPage(doc: PDFDocument, pageIndex: number): string {
  const page = doc.getPage(pageIndex);
  const contents = page.node.Contents();

  if (!contents) {
    return '';
  }

  const streams = contents instanceof PDFArray ? contents.asArray().map(ref => doc.context.lookup(ref)) : [contents];
  const chunks: string[] = [];

  for (const stream of streams) {
    if (stream instanceof PDFRawStream) {
      chunks.push(Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1'));
    } else if (stream instanceof PDFStream) {
      chunks.push(Buffer.from(stream.getContents()).toString('latin1'));
    }
  }

  return chunks.join('\n');
}

function numeric(tokens: Token[], count: number): number[] {
  return tokens.slice(-count).map(token => Number(token.value));
}

/**
 * 2D affine matrix as PDF stores it: [a b c d e f], applied to a row vector.
 * `multiply(left, right)` means "apply left, then right" — i.e. left x right.
 */
type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(left: Matrix, right: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = left;
  const [a2, b2, c2, d2, e2, f2] = right;

  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ];
}

function translation(tx: number, ty: number): Matrix {
  return [1, 0, 0, 1, tx, ty];
}

export function extractTextItems(doc: PDFDocument, pageIndex: number): ITextItem[] {
  const tokens = tokenize(contentStringForPage(doc, pageIndex));
  const items: ITextItem[] = [];
  const stack: Matrix[] = [];

  let ctm: Matrix = [...IDENTITY];
  let textMatrix: Matrix = [...IDENTITY];
  let lineMatrix: Matrix = [...IDENTITY];
  let leading = 0;
  let fontSize = 0;
  let operands: Token[] = [];
  let pending = '';
  let pendingX = 0;
  let pendingY = 0;
  let pendingSize = 0;

  // Page-space origin of the current text line, and the effective glyph height
  // (the Tm/CTM scale factors multiplied into the `Tf` size — these forms set
  // `/TT0 1 Tf` and carry the real size in the text matrix).
  const originX = (): number => multiply(textMatrix, ctm)[4];
  const originY = (): number => multiply(textMatrix, ctm)[5];
  const effectiveSize = (): number => fontSize * multiply(textMatrix, ctm)[3];

  const flush = (): void => {
    if (pending.trim().length > 0) {
      items.push({ page: pageIndex, x: pendingX, y: pendingY, size: pendingSize, text: pending });
    }

    pending = '';
  };

  const show = (text: string): void => {
    if (pending.length === 0) {
      pendingX = originX();
      pendingY = originY();
      pendingSize = effectiveSize();
    }

    pending += text;
  };

  const setLine = (matrix: Matrix): void => {
    lineMatrix = matrix;
    textMatrix = [...matrix];
  };

  for (const token of tokens) {
    if (token.type === 'operand') {
      operands.push(token);
      continue;
    }

    switch (token.value) {
      case 'q':
        stack.push([...ctm] as Matrix);
        break;
      case 'Q': {
        const restored = stack.pop();
        ctm = restored ?? [...IDENTITY];
        break;
      }
      case 'cm': {
        const [a, b, c, d, e, f] = numeric(operands, 6);
        ctm = multiply([a, b, c, d, e, f], ctm);
        break;
      }
      case 'BT':
        flush();
        setLine([...IDENTITY]);
        break;
      case 'ET':
        flush();
        break;
      case 'Tf': {
        const [size] = numeric(operands, 1);
        fontSize = size || fontSize;
        break;
      }
      case 'TL': {
        const [value] = numeric(operands, 1);
        leading = value || 0;
        break;
      }
      case 'Td': {
        flush();
        const [tx, ty] = numeric(operands, 2);
        setLine(multiply(translation(tx || 0, ty || 0), lineMatrix));
        break;
      }
      case 'TD': {
        flush();
        const [tx, ty] = numeric(operands, 2);
        leading = -(ty || 0);
        setLine(multiply(translation(tx || 0, ty || 0), lineMatrix));
        break;
      }
      case 'Tm': {
        flush();
        const [a, b, c, d, e, f] = numeric(operands, 6);
        setLine([a, b, c, d, e, f]);
        break;
      }
      case 'T*': {
        flush();
        setLine(multiply(translation(0, -leading), lineMatrix));
        break;
      }
      case 'Tj':
      case "'":
      case '"': {
        if (token.value !== 'Tj') {
          flush();
          setLine(multiply(translation(0, -leading), lineMatrix));
        }

        const last = operands[operands.length - 1];
        show(last ? decodeStringOperand(last.value) : '');
        break;
      }
      case 'TJ': {
        // operands are the flattened contents of the [ ... ] array
        for (const operand of operands) {
          if (operand.value.startsWith('(') || (operand.value.startsWith('<') && !operand.value.startsWith('<<'))) {
            show(decodeStringOperand(operand.value));
          }
        }
        break;
      }
      default:
        break;
    }

    operands = [];
  }

  flush();

  return items;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const pageArgIndex = args.indexOf('--page');
  const grepArgIndex = args.indexOf('--grep');
  const onlyPage = pageArgIndex >= 0 ? Number(args[pageArgIndex + 1]) : undefined;
  const grep = grepArgIndex >= 0 ? args[grepArgIndex + 1]?.toLowerCase() : undefined;

  const bytes = SF424Helper.loadBasePdf();
  const doc = await PDFDocument.load(bytes);

  console.log(`SF-424 base PDF: ${SF424_BASE_PDF_PATH}`);
  console.log(`  bytes: ${bytes.length}  pages: ${doc.getPageCount()}`);

  for (let pageIndex = 0; pageIndex < doc.getPageCount(); pageIndex += 1) {
    if (onlyPage !== undefined && pageIndex !== onlyPage) {
      continue;
    }

    const page = doc.getPage(pageIndex);
    const { width, height } = page.getSize();
    const items = extractTextItems(doc, pageIndex)
      .filter(item => !grep || item.text.toLowerCase().includes(grep))
      .sort((left, right) => right.y - left.y || left.x - right.x);

    console.log(`\n${'='.repeat(78)}\nPAGE ${pageIndex} — ${width}x${height} — ${items.length} text runs\n${'='.repeat(78)}`);

    for (const item of items) {
      console.log(`  x=${item.x.toFixed(1).padStart(6)} y=${item.y.toFixed(1).padStart(6)} size=${item.size.toFixed(1).padStart(4)}  ${item.text}`);
    }
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('map-sf424-fields failed:', error);
    process.exit(1);
  });
}

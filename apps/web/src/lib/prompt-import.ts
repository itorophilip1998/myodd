const MAX_CHARS = 4000;

function clip(text: string) {
  const cleaned = text.replace(/\u0000/g, '').replace(/\r\n/g, '\n').trim();
  if (cleaned.length <= MAX_CHARS) return cleaned;
  return cleaned.slice(0, MAX_CHARS).trimEnd();
}

async function readPdf(file: File) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 20); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map(item => ('str' in item ? String((item as { str?: string }).str ?? '') : '')).join(' '));
  }
  return pages.join('\n');
}

async function readDocx(file: File) {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value;
}

export async function extractPromptFromFile(file: File): Promise<{ text: string; truncated: boolean }> {
  const name = file.name.toLowerCase();
  const type = file.type;
  let raw = '';

  if (name.endsWith('.txt') || name.endsWith('.md') || type === 'text/plain' || type === 'text/markdown') {
    raw = await file.text();
  } else if (name.endsWith('.pdf') || type === 'application/pdf') {
    raw = await readPdf(file);
  } else if (
    name.endsWith('.docx')
    || type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    raw = await readDocx(file);
  } else if (name.endsWith('.doc') || type === 'application/msword') {
    throw new Error('Classic .doc isn’t supported. Save as .docx, .pdf, or .txt and try again.');
  } else {
    throw new Error('Use a .txt, .pdf, or .docx file.');
  }

  const text = clip(raw);
  if (!text) throw new Error('No readable text found in that file.');
  return { text, truncated: raw.trim().length > MAX_CHARS };
}

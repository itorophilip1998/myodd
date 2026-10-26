import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
export const alt = 'MyOdd — Football booking code generator and betting tools';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export default async function Image() {
  const logo = await readFile(join(process.cwd(), 'src/app/icon.png'));
  return new ImageResponse(<div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', height: '100%', padding: 80, background: '#17231f', color: '#e8f1e3' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}><img src={`data:image/png;base64,${logo.toString('base64')}`} width="96" height="96" alt="" /><span style={{ fontSize: 56, color: '#a9d872' }}>MyOdd</span></div>
    <div style={{ display: 'flex', fontSize: 62, marginTop: 32 }}>Football booking codes. Your way.</div>
    <div style={{ display: 'flex', fontSize: 26, marginTop: 28 }}>Generate · Organize · Share · Check results</div>
    <div style={{ display: 'flex', fontSize: 22, marginTop: 40 }}>myodd.org · 18+ · Gamble responsibly</div>
  </div>, size);
}

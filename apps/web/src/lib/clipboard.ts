export async function copyText(value: string) {
  if (navigator.clipboard?.writeText) { try { await navigator.clipboard.writeText(value); return; } catch { /* Fall back for browsers that restrict writes after async verification. */ } }
  const input = document.createElement('textarea'); input.value = value;
  input.style.position = 'fixed'; input.style.opacity = '0'; document.body.appendChild(input); input.select();
  try { if (!document.execCommand('copy')) throw new Error('Copy unavailable. Select the code to copy it.'); }
  finally { input.remove(); }
}

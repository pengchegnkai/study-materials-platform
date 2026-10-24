/**
 * 预览工具：按类型把 /api/file 取回的 ArrayBuffer 渲染到容器。
 * - Markdown: markdown-it 直接渲染
 * - DOCX: docx-preview
 * - PPTX: @aiden0z/pptx-renderer
 * - 图片: 居中展示
 */

import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

export type PreviewKind = 'markdown' | 'docx' | 'pptx' | 'excel' | 'image' | 'other';

export function kindFromType(type: string): PreviewKind {
  if (type === 'markdown' || type === 'docx' || type === 'pptx' || type === 'excel' || type === 'image') return type;
  return 'other';
}

export async function renderPreview(
  kind: PreviewKind,
  buffer: ArrayBuffer,
  container: HTMLElement
): Promise<void> {
  container.innerHTML = '';

  if (kind === 'markdown') {
    const text = new TextDecoder().decode(buffer);
    const el = document.createElement('div');
    el.className = 'markdown-body';
    el.innerHTML = md.render(text);
    el.style.cssText = 'max-width:760px;margin:0 auto;padding:32px 24px;font-size:14px;line-height:1.6;color:var(--preview-text);';
    container.appendChild(el);
    return;
  }

  if (kind === 'image') {
    const blob = new Blob([buffer]);
    const url = URL.createObjectURL(blob);
    const img = document.createElement('img');
    img.src = url;
    img.style.cssText = 'display:block;max-width:100%;max-height:100%;margin:0 auto;object-fit:contain;';
    container.style.display = 'flex';
    container.style.alignItems = 'flex-start';
    container.style.justifyContent = 'center';
    container.appendChild(img);
    return;
  }

  if (kind === 'docx') {
    const docx = await import('docx-preview');
    await docx.renderAsync(buffer, container, undefined, {
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
    });
    return;
  }

  if (kind === 'pptx') {
    const mod: any = await import('@aiden0z/pptx-renderer');
    const Renderer = mod.PptxRenderer || mod.default;
    const renderer = new Renderer();
    await renderer.render(buffer, container);
    return;
  }

  if (kind === 'excel') {
    const XLSX: any = await import('xlsx');
    const wb = XLSX.read(buffer, { type: 'array' });
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:24px;max-width:100%;overflow-x:auto;';
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name];
      if (!sheet) continue;
      const title = document.createElement('h3');
      title.textContent = name;
      title.style.cssText = 'font-size:15px;font-weight:600;margin:16px 0 8px;color:var(--preview-text,#111827);';
      wrap.appendChild(title);
      let html = '';
      try {
        html = XLSX.utils.sheet_to_html(sheet, { header: '', footer: '' });
      } catch {
        html = '<p style="color:#6B7280">该工作表无法解析</p>';
      }
      const tableWrap = document.createElement('div');
      tableWrap.innerHTML = html;
      const table = tableWrap.querySelector('table');
      if (table) {
        table.style.cssText = 'border-collapse:collapse;font-size:13px;min-width:100%;';
        table.querySelectorAll('td,th').forEach((c: any) => {
          c.style.cssText = 'border:1px solid #E5E7EB;padding:4px 8px;white-space:nowrap;';
        });
        table.querySelectorAll('tr td:first-child, tr th').forEach((c: any) => {
          c.style.background = '#F9FAFB';
          c.style.fontWeight = '600';
        });
      }
      wrap.appendChild(tableWrap);
    }
    container.style.display = '';
    container.appendChild(wrap);
    return;
  }

  const el = document.createElement('div');
  el.textContent = '该文件类型暂不支持在线预览，请下载查看。';
  el.style.cssText = 'padding:48px 24px;text-align:center;color:#6B7280;font-size:14px;';
  container.appendChild(el);
}

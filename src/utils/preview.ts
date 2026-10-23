/**
 * 预览工具：按类型把 /api/file 取回的 ArrayBuffer 渲染到容器。
 * - Markdown: markdown-it 直接渲染
 * - DOCX: docx-preview
 * - PPTX: @aiden0z/pptx-renderer
 * - 图片: 居中展示
 */

import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

export type PreviewKind = 'markdown' | 'docx' | 'pptx' | 'image' | 'other';

export function kindFromType(type: string): PreviewKind {
  if (type === 'markdown' || type === 'docx' || type === 'pptx' || type === 'image') return type;
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

  const el = document.createElement('div');
  el.textContent = '该文件类型暂不支持在线预览，请下载查看。';
  el.style.cssText = 'padding:48px 24px;text-align:center;color:#6B7280;font-size:14px;';
  container.appendChild(el);
}

/**
 * 预览工具：按类型把 /api/file 取回的 ArrayBuffer 渲染到容器。
 * - Markdown: markdown-it 直接渲染
 * - DOCX: docx-preview
 * - PPTX: @aiden0z/pptx-renderer
 * - 图片: 居中展示
 */

import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

export type PreviewKind = 'markdown' | 'docx' | 'pptx' | 'excel' | 'pdf' | 'image' | 'html' | 'other';

export function kindFromType(type: string): PreviewKind {
  if (type === 'markdown' || type === 'docx' || type === 'pptx' || type === 'excel' || type === 'pdf' || type === 'image' || type === 'html') return type;
  return 'other';
}

export interface ManifestFileMeta {
  key: string;
  title: string;
  type: string;
}

export async function renderPreview(
  kind: PreviewKind,
  buffer: ArrayBuffer,
  container: HTMLElement,
  manifest?: ManifestFileMeta[],
  fileKey = ''
): Promise<void> {
  container.innerHTML = '';

  if (kind === 'markdown') {
    let text = new TextDecoder().decode(buffer);
    if (text.includes('\uFFFD')) {
      try {
        const gbk = new TextDecoder('gbk').decode(buffer);
        if (!gbk.includes('\uFFFD')) text = gbk;
      } catch {}
    }
    // 图片引用解析：相对路径 src → 在 manifest 里按路径/文件名匹配 key → /api/file?key=
    // 匹配优先级：① 当前目录 + 相对路径完整 key ② key 以相对路径结尾（子目录引用）
    //            ③ 同目录同名 ④ 全局同名（兜底）
    if (manifest && manifest.length > 0) {
      const decode = (v: string) => {
        try {
          return decodeURIComponent(v);
        } catch {
          return v;
        }
      };
      const dirOf = (k: string) => (k.includes('/') ? k.slice(0, k.lastIndexOf('/')) : '');
      const nameOf = (k: string) => k.split('/').pop() || '';
      const mdDir = fileKey.includes('/') ? fileKey.slice(0, fileKey.lastIndexOf('/')) : '';

      text = text.replace(/(!\[[^\]]*\]\()([^)\s]+)(\s+"[^"]*")?\)/g, (whole, pre, src, post) => {
        if (/^(https?:|data:|blob:)/i.test(src)) return whole;
        // 解码 + 规范化相对路径（处理 ./ 与 ../）
        const segs: string[] = [];
        for (const part of decode(src).replace(/\\/g, '/').split('/')) {
          if (part === '..') segs.pop();
          else if (part !== '.' && part !== '') segs.push(part);
        }
        const relPath = segs.join('/');
        const baseName = segs[segs.length - 1] || '';
        if (!baseName) return whole;

        // 上传时间戳前缀：服务器存储名为 `<毫秒时间戳>-<原文件名>`
        const sameFile = (kn: string, name: string) => kn === name || (name.length > 0 && kn.endsWith(`-${name}`));

        let hit: ManifestFileMeta | undefined;
        if (mdDir) hit = manifest.find((f) => f.key === `${mdDir}/${relPath}`);
        hit ??= manifest.find((f) => f.key.endsWith(`/${relPath}`));
        // 优先同科目目录树内匹配（避免跨科目重名错配）
        if (mdDir) hit ??= manifest.find((f) => f.key.startsWith(`${mdDir}/`) && sameFile(nameOf(f.key), baseName));
        hit ??= manifest.find((f) => sameFile(nameOf(f.key), baseName) && dirOf(f.key) === mdDir);
        hit ??= manifest.find((f) => sameFile(nameOf(f.key), baseName));
        return hit ? `${pre}/api/file?key=${encodeURIComponent(hit.key)}${post ?? ''})` : whole;
      });
    }
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
    // 容器在构造函数传入；preview 只接收数据（库无 render 方法）
    const renderer = new Renderer(container);
    await renderer.preview(buffer);
    // slide 固定像素宽，窄屏溢出会被裁剪；按容器宽度等比缩放全部 slide
    await new Promise((r) => setTimeout(r, 200));
    const cw = container.clientWidth;
    if (cw > 0) {
      const slides = Array.from(container.children) as HTMLElement[];
      let maxW = 0;
      for (const d of slides) maxW = Math.max(maxW, d.scrollWidth || 0);
      if (maxW > cw + 2) {
        const z = cw / maxW;
        for (const d of slides) d.style.zoom = String(z);
      }
    }
    return;
  }

  if (kind === 'html') {
    // 沙箱 iframe：允许脚本但隔离源（不可访问本站 Cookie/存储）
    let text = new TextDecoder().decode(buffer);
    if (text.includes('\uFFFD')) {
      try {
        const gbk = new TextDecoder('gbk').decode(buffer);
        if (!gbk.includes('\uFFFD')) text = gbk;
      } catch {}
    }
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.style.cssText = 'width:100%;height:calc(100vh - 190px);min-height:480px;border:0;display:block;background:#fff;';
    frame.srcdoc = text;
    container.appendChild(frame);
    return;
  }

  if (kind === 'pdf') {
    // 浏览器内置 PDF 查看器（同源请求自动带凭证）；父容器高度由内容撑开，用视口高度避免 iframe 塌缩
    container.style.display = '';
    const frame = document.createElement('iframe');
    frame.src = `/api/file?key=${encodeURIComponent(fileKey)}`;
    frame.style.cssText = 'width:100%;height:calc(100vh - 190px);min-height:480px;border:0;display:block;';
    container.appendChild(frame);
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

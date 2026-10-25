/** 统一 fetch 封装：自动 JSON、credentials、错误抛出 */

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function handle(resp: Response): Promise<any> {
  if (resp.status === 401) {
    throw new ApiError('未登录', 401);
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new ApiError((data as any).error || `请求失败 (${resp.status})`, resp.status);
  }
  return data;
}

export async function apiGet<T = any>(path: string): Promise<T> {
  const resp = await fetch(path, { credentials: 'include' });
  return handle(resp);
}

export async function apiPost<T = any>(path: string, body: unknown): Promise<T> {
  const resp = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handle(resp);
}

export async function apiPatch<T = any>(path: string, body: unknown): Promise<T> {
  const resp = await fetch(path, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handle(resp);
}

export async function apiDelete<T = any>(path: string): Promise<T> {
  const resp = await fetch(path, { method: 'DELETE', credentials: 'include' });
  return handle(resp);
}

export function apiUpload<T = any>(
  path: string,
  form: FormData,
  onProgress?: (pct: number) => void
): Promise<T> {
  // fetch 不支持上传进度，改用 XHR 的 upload.onprogress
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', path);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let data: any = {};
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status === 401) reject(new ApiError('未登录', 401));
      else if (xhr.status >= 400) reject(new ApiError((data as any).error || `请求失败 (${xhr.status})`, xhr.status));
      else resolve(data as T);
    };
    xhr.onerror = () => reject(new ApiError('网络连接失败：无法连接服务器', 0));
    xhr.send(form);
  });
}

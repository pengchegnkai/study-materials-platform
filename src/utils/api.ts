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

export async function apiUpload<T = any>(path: string, form: FormData): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(path, { method: 'POST', credentials: 'include', body: form });
  } catch (err: any) {
    // 网络层失败（断连/被重置/超时），与 HTTP 状态码错误区分开
    throw new ApiError(`网络连接失败：${err?.message || '无法连接服务器'}`, 0);
  }
  return handle(resp);
}

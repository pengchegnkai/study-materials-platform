/**
 * PATCH /api/update-file —— 别名端点，与 PATCH /api/file 等价。
 * requireOwner；只允许改 title / visibility。
 */

export { onRequestPatch } from './file';

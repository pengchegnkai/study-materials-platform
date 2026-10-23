#!/usr/bin/env node
// 生成 PBKDF2-SHA256 密码哈希，用于 ADMIN_PASSWORD_HASH 环境变量
// 用法: node scripts/hash-password.mjs 你的密码
// 输出格式: pbkdf2$100000$saltBase64$hashBase64
// 切勿将明文密码或哈希提交到仓库。

import { webcrypto as crypto } from 'node:crypto';

const ITERATIONS = 100000;
const KEY_LENGTH = 32; // bytes

const password = process.argv[2];

if (!password) {
  console.error('用法: node scripts/hash-password.mjs 你的密码');
  process.exit(1);
}

const salt = crypto.getRandomValues(new Uint8Array(16));

const keyMaterial = await crypto.subtle.importKey(
  'raw',
  new TextEncoder().encode(password),
  'PBKDF2',
  false,
  ['deriveBits']
);

const bits = await crypto.subtle.deriveBits(
  {
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt,
    iterations: ITERATIONS,
  },
  keyMaterial,
  KEY_LENGTH * 8
);

const saltB64 = Buffer.from(salt).toString('base64');
const hashB64 = Buffer.from(new Uint8Array(bits)).toString('base64');

console.log(`pbkdf2$${ITERATIONS}$${saltB64}$${hashB64}`);

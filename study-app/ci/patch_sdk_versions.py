#!/usr/bin/env python3
"""CI 辅助：统一设置 android/app 的 minSdk/compileSdk/targetSdk（兼容 Groovy/Kotlin DSL）。

用法：python3 ci/patch_sdk_versions.py <android/app 目录>

支持的写法（正则统一替换）：
- Kotlin DSL (build.gradle.kts):  compileSdk = flutter.compileSdkVersion / compileSdk = 35
- Groovy     (build.gradle):      compileSdkVersion flutter.compileSdkVersion / compileSdk 35
                              或  compileSdkVersion = 35（新 groovy 也可能用等号）
若某键未匹配到任何行，会打印 MISSING 供 CI 注解带出。
"""
import os
import re
import sys


def main() -> None:
    if len(sys.argv) != 2:
        print('用法: patch_sdk_versions.py <android/app 目录>')
        sys.exit(1)
    base = sys.argv[1]
    targets = {'minSdk': 24, 'compileSdk': 36, 'targetSdk': 36}

    for fname in ['build.gradle', 'build.gradle.kts']:
        path = os.path.join(base, fname)
        if not os.path.isfile(path):
            continue
        is_kotlin = fname.endswith('.kts')
        with open(path, 'r', encoding='utf-8') as f:
            src = f.read()
        orig = src

        for key, val in targets.items():
            if is_kotlin:
                # compileSdk = <任意右侧表达式>
                src, n1 = re.subn(rf'\b{key}\s*=\s*\S+', f'{key} = {val}', src)
                missing = n1 == 0
            else:
                # compileSdkVersion flutter.xxx / compileSdkVersion 35 / compileSdkVersion = 35
                src, n1 = re.subn(rf'\b{key}Version\s+flutter\.\w+', f'{key}Version {val}', src)
                src, n2 = re.subn(rf'\b{key}Version\s*=\s*\S+', f'{key}Version = {val}', src)
                src, n3 = re.subn(rf'\b{key}\s+flutter\.\w+', f'{key} {val}', src)
                missing = (n1 + n2 + n3) == 0
            if missing:
                print(f'::error::DIAG {fname}: {key} 未匹配到任何设置行')

        if src != orig:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(src)
            print(f'{fname}: SDK 版本设置已更新')
        else:
            print(f'{fname}: 内容无变化')

        # 诊断：把 SDK 相关行以注解带出（匿名 check-run API 可读）
        for i, line in enumerate(src.splitlines(), 1):
            if re.search(r'\b(minSdk|compileSdk|targetSdk)\b', line) and 'flutter' not in line:
                print(f'::error::DIAG {fname}:{i}: {line.strip()[:160]}')


if __name__ == '__main__':
    main()

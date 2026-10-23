#!/usr/bin/env python3
"""CI 辅助：确保 release 构建关闭 R8 混淆（兼容 Groovy 与 Kotlin DSL）。

用法：python3 ci/disable_minify.py <android/app 目录或 build.gradle 路径>

2026 stable 的 `flutter create` 默认生成 Kotlin DSL（build.gradle.kts），
其中 minify 的属性名是 isMinifyEnabled / isShrinkResources；
旧版 Groovy（build.gradle）则是 minifyEnabled / shrinkResources。
本脚本自动探测文件与语法，逐个处理；找不到目标文件时不报错退出（不阻塞流水线）。
"""
import os
import sys

KOTLIN_OFF = ['isMinifyEnabled = false', 'isShrinkResources = false']
GROOVY_OFF = ['minifyEnabled false', 'shrinkResources false']

KOTLIN_TRUE = ['isMinifyEnabled = true', 'isMinifyEnabled(true', 'isMinifyEnabled(true)']
GROOVY_TRUE = ['minifyEnabled true', 'minifyEnabled = true', 'minifyEnabled(true)']


def candidates(base: str):
    """由传入的目录或文件路径，推导出可能的 gradle 文件列表。"""
    if os.path.isfile(base):
        return [base]
    if os.path.isdir(base):
        return [os.path.join(base, 'build.gradle'), os.path.join(base, 'build.gradle.kts')]
    return []


def process(path: str) -> bool:
    with open(path, 'r', encoding='utf-8') as f:
        src = f.read()

    is_kotlin = path.endswith('.kts')
    true_markers = KOTLIN_TRUE if is_kotlin else GROOVY_TRUE
    off_lines = (KOTLIN_OFF if is_kotlin else GROOVY_OFF)
    off_flag = off_lines[0].split('=')[0].strip() if is_kotlin else 'minifyEnabled'
    off_key = ('isMinifyEnabled' if is_kotlin else 'minifyEnabled')

    changed = False
    # 1) 显式开启的写法 → 关闭
    for marker in true_markers:
        if marker in src:
            src = src.replace(marker, off_lines[0])
            changed = True

    # 2) 已有 minify 行（刚替换或本来就有）：到此完成，不再插入
    if off_key in src:
        if changed:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(src)
            print(f'{os.path.basename(path)}: 已将开启的 minify 改为 {off_lines[0]}')
        else:
            print(f'{os.path.basename(path)}: 已存在 minify 配置且非 true，跳过')
        return True

    # 3) 模板未写 minify：插入到第一个 release { 块内
    marker = 'release {'
    idx = src.find(marker)
    if idx == -1:
        print(f'{os.path.basename(path)}: 未找到 release {{ 块，跳过插入')
        return True
    insert_at = idx + len(marker)
    indent = '\n            '
    src = src[:insert_at] + ''.join(indent + line for line in off_lines) + src[insert_at:]
    with open(path, 'w', encoding='utf-8') as f:
        f.write(src)
    print(f'{os.path.basename(path)}: 已插入 {off_lines}')
    return True


def main() -> None:
    if len(sys.argv) != 2:
        print('用法: disable_minify.py <android/app 目录或 build.gradle 路径>')
        sys.exit(1)
    files = candidates(sys.argv[1])
    if not files:
        print(f'未找到 gradle 文件（{sys.argv[1]}），跳过（不阻塞构建）')
        sys.exit(0)
    for p in files:
        if os.path.exists(p):
            process(p)
        else:
            print(f'跳过不存在的文件: {p}')
    sys.exit(0)


if __name__ == '__main__':
    main()

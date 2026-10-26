#!/usr/bin/env python3
"""CI: 给 build_tmp/android/app/build.gradle.kts 显式注入固定签名配置。

不再依赖「~/.android/debug.keystore 默认路径」这一隐式行为（实测未生效，
每个 runner 各自随机生成签名导致覆盖安装冲突）。keystore 文件由 workflow
解码到 build.gradle.kts 同目录（ci.keystore），file() 相对路径即可解析。
"""
import sys


def main(path: str) -> None:
    with open(path, encoding="utf-8") as f:
        s = f.read()

    if "signingConfigs" in s and "ci.keystore" in s:
        print("signing 已注入，跳过")
        return

    signing = """
    // CI: 固定签名（防覆盖安装冲突），keystore 由 workflow 解码到同目录
    signingConfigs {
        create("ci") {
            storeFile = file("ci.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }
"""
    # 在 android { 块开头插入 signingConfigs
    import re
    s2 = re.sub(r"(android\s*\{)", r"\1" + signing, s, count=1)
    if s2 == s:
        raise SystemExit("未找到 android { 块，注入失败")

    # release / debug 构建类型都指向固定签名（兼容 kts 的 release { 与 getByName("release") { 两种写法）
    for name in ("release", "debug"):
        s2 = re.sub(
            rf"(\b{name}\s*\{{)",
            r"\1\n            signingConfig = signingConfigs.getByName(\"ci\")",
            s2,
            count=1,
        )

    with open(path, "w", encoding="utf-8") as f:
        f.write(s2)
    print("已注入固定签名配置:", path)


if __name__ == "__main__":
    main(sys.argv[1])

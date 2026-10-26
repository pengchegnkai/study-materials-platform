#!/usr/bin/env python3
"""CI: 给 build_tmp/android/app/build.gradle.kts 显式注入固定签名配置。

不再依赖「~/.android/debug.keystore 默认路径」这一隐式行为（实测未生效，
每个 runner 各自随机生成签名导致覆盖安装冲突）。keystore 文件由 workflow
解码到 build.gradle.kts 同目录（ci.keystore），file() 相对路径即可解析。

注意：注入用 str.replace 而非 re.sub，避免 \1 转义陷阱丢失捕获组。
"""
import sys


def main(path: str) -> None:
    with open(path, encoding="utf-8") as f:
        s = f.read()

    if "ci.keystore" in s:
        print("signing 已注入，跳过")
        return

    signing = (
        "\n"
        "    // CI: 固定签名（防覆盖安装冲突），keystore 由 workflow 解码到同目录\n"
        "    signingConfigs {\n"
        '        create("ci") {\n'
        '            storeFile = file("ci.keystore")\n'
        '            storePassword = "android"\n'
        '            keyAlias = "androiddebugkey"\n'
        '            keyPassword = "android"\n'
        "        }\n"
        "    }"
    )
    if "android {" not in s:
        raise SystemExit("未找到 android { 块，注入失败")
    s = s.replace("android {", "android {" + signing, 1)

    # buildTypes.release 指向固定签名（当前模板 buildTypes 内只有 release 块）
    release_line = '            signingConfig = signingConfigs.getByName("ci")\n'
    if "release {" not in s:
        raise SystemExit("未找到 release { 块，注入失败")
    s = s.replace("release {", "release {\n" + release_line, 1)
    # 删除模板原有的 debug 签名行：它在 ci 行之后赋值会覆盖固定签名，
    # 且 runner 上无 ~/.android/debug.keystore 时 AGP 会随机生成新签名。
    s = s.replace('            signingConfig = signingConfigs.getByName("debug")\n', "")

    with open(path, "w", encoding="utf-8") as f:
        f.write(s)
    print("已注入固定签名配置:", path)


if __name__ == "__main__":
    main(sys.argv[1])

# Vendor update SDKs

These unmodified Android archives are pinned locally because HONOR distributes a download and
Xiaomi's Maven repository requires credentials. The build never embeds those credentials.
They are used only for query callbacks; Cherry owns the prompt and explicit store navigation.

| Archive | Official source | SHA-256 |
| --- | --- | --- |
| `appmarket-updater-open-16.0.18.301.aar` | [HONOR SDK download](https://developer.honor.com/cn/doc/guides/101425) / [official archive](https://contentplatform-drcn.hihonorcdn.com/developerPlatform/appmarket-updater-open-16.0.18.301/appmarket-updater-open-16.0.18.301.rar) | `3d358840aa84c0760ac0c3f569186a4cd4f5f0a485976477ec481d7727cd3c67` |
| `xiaomi-update-sdk-4.2.4.aar` | [Xiaomi integration guide](https://dev.mi.com/xiaomihyperos/documentation/detail?pId=1315), `mi-appstore:xiaomi-update-sdk:4.2.4` at `https://repos.xiaomi.com/maven` | `585ced983a6773f5aaa7a8cf8b459324a3fc1650cb1d3fb2caa987eaac0c3b2b` |

Retrieved 2026-11-02. Vendor SDKs remain subject to their respective vendor terms. When updating an
archive, review the official API and privacy changes, update this table, and obtain authorization
for the new native build and device verification. `scripts/withAppUpdates.js` registers this
folder as a Gradle repository only for `production-domestic-stores`; the Expo module selects
the named AAR dependencies and vendor source/manifest only for that distribution.

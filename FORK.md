# This fork

Official [T3 Code](https://github.com/pingdotgg/t3code) plus a Tasks board: tasks one level above
threads, kept current by agents through the [t3-tasks](https://github.com/Shaurya-GitH/t3-tasks)
service. The work lives on the `tasks` branch; `main` mirrors upstream.

## Install

Apple silicon Macs. Run in Terminal (it quits T3 Code, keeps threads and settings):

```sh
curl -fsSL https://raw.githubusercontent.com/Shaurya-GitH/t3code/tasks/scripts/install-fork.sh | bash
```

After that the app's update button keeps it current. To go back, install the official app from
[t3.codes](https://t3.codes).

## Releases

`.github/workflows/fork-release.yml` runs every four hours and on each push to `tasks`. It moves
the fork's commits onto the newest official release (in the build only), builds, signs and
publishes a GitHub Release here. If the commits no longer apply, it opens an issue and the fork
keeps its last release.

- Version for official X.Y.Z: X.Y.(Z×1000+n), so 0.1.8 becomes 0.1.8001, 0.1.8002 and so on.
- Signing: a self-signed certificate (secrets `FORK_MAC_SIGNING_P12`,
  `FORK_MAC_SIGNING_P12_PASSWORD`). macOS accepts an update only when it is signed by the same
  certificate as the installed app, so keep a backup of it: a new certificate means one more
  manual install.
- Not notarized: a DMG downloaded in a browser gets the "unidentified developer" prompt. The
  install script and in-app updates download without it.

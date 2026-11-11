// Keeps pnpm-lock.yaml registry-agnostic: when someone installs through a private npm mirror
// (e.g. a corporate Artifactory), pnpm may record the mirror's tarball URLs in the lockfile.
// We drop them so every contributor resolves packages from their own configured registry;
// the `integrity` hash still pins the exact package content.
function afterAllResolved(lockfile) {
  for (const pkg of Object.values(lockfile.packages ?? {})) {
    const { resolution } = pkg;
    if (resolution?.integrity && resolution.tarball && /\/-\/[^/]+\.tgz$/.test(resolution.tarball)) {
      delete resolution.tarball;
    }
  }
  return lockfile;
}

module.exports = { hooks: { afterAllResolved } };

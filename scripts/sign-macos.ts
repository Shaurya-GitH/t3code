import { sign as signApplication, type SignOptions } from "@electron/osx-sign";

export default async function sign(options: SignOptions): Promise<void> {
  // Fork builds: electron-builder asks for ad-hoc ("-"); sign with the self-signed
  // certificate instead (see build-desktop-artifact.ts).
  const selfSignIdentity = process.env.T3CODE_MAC_SELF_SIGN_IDENTITY?.trim();
  const identity = options.identity === "-" ? selfSignIdentity : undefined;
  await signApplication({
    ...options,
    ...(identity ? { identity } : {}),
    batchCodesignCalls: true,
  });
}

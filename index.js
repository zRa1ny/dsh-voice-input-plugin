/**
 * dsh-voice-input-plugin — node half.
 *
 * Deliberately empty. The whole feature is the browser half (`./client`), and
 * the web client's module registry reaches it by scanning enabled Loader
 * entries for packages that declare `dsh.client` — a dependency that is never
 * mounted as an entry is never scanned. This row therefore exists to give that
 * declaration an entry to be read from, and contributes nothing else: no
 * service, tool, event, or prompt section.
 *
 * Named exports only. A `default` export would make the Loader's unwrapExports
 * resolve to that single binding and drop this namespace — which is how a
 * plugin's `inject` disappears (docs/postmortem/0001-acp-default-export-drops-inject.md).
 */

/** Display name for Loader diagnostics. */
export const name = 'voice-input'

/** Host plugin body: this bundle's feature is browser-only. */
export function apply() {}

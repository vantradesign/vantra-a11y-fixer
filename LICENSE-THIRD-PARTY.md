# Third-party licenses

`vantra-a11y-fixer` itself is licensed under the **Mozilla Public License 2.0**
(see `LICENSE`). This file documents the licenses of bundled and build-time
dependencies, and why the combination is coherent.

## Bundled at runtime (shipped inside the extension package)

| Dependency | Version | License | Notes |
| --- | --- | --- | --- |
| [axe-core](https://github.com/dequelabs/axe-core) | ^4 (4.13.0 resolved) | **MPL-2.0** | Detection engine. Bundled unmodified into `content.js`. Its copyright banner must be preserved — see below. |
| [Vue](https://github.com/vuejs/core) | ^3 | MIT | Side-panel UI |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) | ^4 | MIT | Build-time CSS generation |

## Important: the axe-core license is *not* MIT

A widespread assumption — including in this project's own kickoff brief — is that
axe-core is MIT-licensed. It is not: axe-core is distributed under the
**Mozilla Public License, version 2.0**.

### It is *not* "Exhibit B" either

An earlier revision of this file claimed axe-core carries MPL-2.0 **Exhibit B**
("Incompatible With Secondary Licenses", SPDX `MPL-2.0-no-copyleft-exception`).
That claim does not hold up against the vendored artefact:

- `node_modules/axe-core/LICENSE` is the **verbatim MPL-2.0 template**. Every
  verbatim copy of that template ends with the *unattached* Exhibit A and
  Exhibit B specimen notices — our own `LICENSE` contains the same Exhibit B
  text. Its presence in a licence file proves nothing.
- Exhibit B only takes effect when the notice is **attached to the covered
  files**. The banner in `axe.js` is the plain Exhibit A notice; it contains no
  "Incompatible With Secondary Licenses" wording.

So axe-core is plain **`MPL-2.0`**, its `package.json` is correct, and MPL-2.0
§3.3 — distributing a "Larger Work" under a Secondary License such as GPL or
AGPL — remains available. A GPL/AGPL licence for this project would therefore
*not* have been blocked by axe-core.

**Our resolution:** we keep **MPL-2.0** for the Vantra-authored code anyway. The
licences then match file-for-file, no §3.3 argument or exception clause has to
be made, and the copyleft intent (modifications to our files must stay open) is
preserved. This is now a deliberate simplicity choice rather than a forced one.

This is documentation of a technical fact pattern, not legal advice. Obtain
counsel before any commercial distribution.

## Notice preservation is a hard requirement

The `axe.js` banner states: *"This entire copyright notice must appear in every
copy of this file you distribute or in any file that contains substantial
portions of this source code."* Because axe-core is bundled into `content.js`,
the build must not strip that banner — `vite.content.config.ts` re-emits it via
`output.banner`. Do not remove that banner without replacing it with an
equivalent notice in the shipped artefact.

## Per-file notices

Every Vantra-authored source file carries the MPL-2.0 Exhibit A header.
`axe-core` is bundled unmodified. We do not attach Exhibit B to any
Vantra-authored file, so our code stays compatible with Secondary Licenses for
downstream users.

## Keeping this file accurate

There is currently **no automated licence gate** in this repository — an earlier
revision of this file described a CI-enforced `pnpm run license:check` against
`scripts/license-allowlist.json`; neither the script nor the allowlist exists,
and the repository has no CI workflows at all. Until that is built, review
dependency licences by hand and update this document in the same commit that
adds the dependency.

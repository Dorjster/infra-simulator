# Infra Simulator 53.0.1 — Global Defensive: import the assets folder as one zip

Global Defensive only. A small fix on top of 53.0.0. Other modes are unchanged.

You can now zip the whole "Infra Simulator Assets" folder with Finder (right-click → Compress) and import that one zip
in **Settings → Models and maps → Import asset pack**. Packs bigger than 2 GB now import in the desktop app too.

## What was wrong

- **Big packs failed in the desktop app.** The room collected the whole upload into one block of memory before it
  unpacked anything. The desktop app's JavaScript engine cannot allocate a block of 2.3 GB, so a pack that size stopped
  with "Not a usable asset pack: Array buffer allocation failed". We got the same error again by running 53.0.0's room
  code inside the installed 53.0.0 app's own runtime (Electron 33.4.11) with the 2.27 GB zip of the folder.
- **The folder's zip was not accepted.** The import only took packs made by `tools/import-cs2-models.mjs`: an
  `infra-pack.json` at the top, with skins and gloves under `skins-pack/` and `gloves-pack/`. A Finder zip has none of
  that. It puts everything inside one top folder, adds `__MACOSX/` and `._` files, and keeps skins and gloves under
  `assets/skins/` and `assets/gloves/`, which the import refused on purpose.
- **The import tool could not write a pack over 2 GB.** One file write in Node is capped at 2 GiB. The tool also held
  the whole pack in memory while writing it.

## What changed

- **The upload goes to a temporary file**, not to memory. The file is removed before the room replies, whether the
  import works or not. If the room is stopped in the middle of an import, the next start removes what it left (staging
  folders over an hour old, uploads over a day old). The limit stays at 3.5 GB: a plain zip can address 4 GB, and the folder zipped is 2.3 GB. If the sender
  gives the size up front and it is too big, the room refuses at once. Only one pack installs at a time.
- **The room reads the zip from that file, one entry at a time** (`lan/zip.mjs`, `openZip`). It reads the zip's
  directory, then unpacks each file straight to disk and checks its CRC-32. Memory stays around the room's normal size.
  It reads what Finder writes (data descriptors), zip64 files (over 4 GB or 65,535 entries), and stored or deflated
  entries.
- **All or nothing, as in 53.0.0.** Every file is first unpacked and checked into a staging folder inside the assets
  folder (`.gd-pack-staging-…`, never served). The skins and gloves are also checked as their installers check them.
  Only when every entry is good are the files moved into place, by rename. If one entry is damaged, anywhere in the
  pack, the pack is refused and nothing installed changes.
- **Safety checks:**
  - A file that unpacks to more than the zip says is refused, and so is a pack that says it unpacks to more than 8 GB
    (or one file over 1 GB). This stops zip bombs.
  - An entry whose packed size cannot match its unpacked size is refused before anything is read. A small map with
    gigabytes behind it would otherwise need gigabytes of memory.
  - Split (multi-part) zips are refused with "zip the folder again as one file".
  - Symbolic links are refused, and so are encrypted entries.
  - Names that could leave the folder are never written: `..`, absolute paths, backslashes, drive letters, empty parts,
    control characters.
  - Files of an unknown type are skipped, as before.
- **The folder's layout is accepted.** If every entry sits in one top folder, that folder is left out. Finder's own files
  (`__MACOSX/`, `._*`, `.DS_Store`) and the READ ME are skipped. A zip with `assets/manifest.json` and no
  `infra-pack.json` counts as the folder. Its `assets/skins/` and `assets/gloves/` are unpacked to a temporary folder and
  installed through the same installers as `skins-pack/` and `gloves-pack/`: checked, never written over file by file,
  and the old set kept as `skins.bak-…` / `gloves.bak-…`. Maps (`maps/<id>.bsp`) load as before. Zipping just the
  folder's contents, without the top folder, works too.
- **Old packs import exactly as before.** That includes the three split zips from 53.0.0. In a pack with
  `infra-pack.json`, `assets/skins/` is still never written over the installed set.
- **The import tool writes big packs.** `tools/import-cs2-models.mjs` now uses `writeZipFile`. It reads each file only
  when its turn comes, writes in pieces of at most 1 GiB, and switches to zip64 past 4 GB or 65,535 entries. It writes
  to `<pack>.part` and renames that at the end.
- **The page did not need a change.** It already sent the chosen file as the request body without reading it in. The
  Settings hint now says the folder can be zipped with Finder.

## How it was checked

- **The zip:** made with `ditto -c -k --sequesterRsrc --keepParent`, which is what Finder's Compress runs. 2.27 GB,
  8,488 entries: 4,312 `__MACOSX` entries, 273 folders and 8,215 entries with data descriptors. 2.80 GB unpacked; the
  biggest file is 100 MB.
- **Where the zip came from:** most of the Desktop copy of the folder (by the end, all 4,040 of its files) and the three
  split zips are in iCloud only. iCloud had moved them off this Mac (the disk is 97 % full), and reading them downloaded about
  2.5 MB a minute. So we built the same folder again from the same source files. Every file has the same name and size
  as on the Desktop, and the 2,015 files that were on the disk are byte for byte the same. The zip was made from that
  copy. The split zips were rebuilt with the script that made them; their sizes are within 1 byte of the Desktop ones.
  Nothing on the Desktop was changed.
- **In the desktop app's runtime** (the installed app with `ELECTRON_RUN_AS_NODE`, Electron 33.4.11):
  - One block of 2.3 GB: "Array buffer allocation failed" (1.2 GB works).
  - 53.0.0's room code with the 2.27 GB zip: "Array buffer allocation failed" after 1.0 s, the bug as you saw it.
  - 53.0.1's room code with the same zip: installed in 12.6 s. 1,639 model files, 8 maps, 1,913 skin files and 479
    glove files went through their installers, and both catalogues (33 guns, 31 knife finishes; 8 glove types, 94
    finishes) and the hit boxes were read again. All 4,039 files of `assets/` and `maps/` arrived with the same bytes,
    and no staging or upload folder was left.
- **In Chrome, through the real Settings button** (with the first 53.0.1 build; the page and upload are unchanged since) (`tests/browser/gd-pack-import-e2e.mjs`, Chrome muted): the same zip
  installed in 15.3 s, and all 8 maps were served afterwards. Chrome's processes grew by 54 MB while it sent 2.27 GB.
- **Old packs:** the three split zips (models, maps, skins) and a small old-format pack were imported one after another
  into a fresh room. All four were accepted, and all 4,039 files arrived with the same bytes. The small pack's `..`
  entry was not written.
- **Damaged and odd zips** (written on purpose): a bad CRC or a zip bomb after good files, finishes that fail the
  skins check, a split zip (`zip -s`), a small map with 600 MB behind it, links (also under `__MACOSX/`), encrypted
  entries, bad names, duplicates. Each was refused or skipped as described above, and a refused pack left the assets
  folder exactly as it was.
- **The writer:** the whole folder written as one 2.14 GiB pack in 30 s. `unzip -t` accepts it, every CRC was read back,
  and it installs in the desktop app's runtime with the same 4,039 files.
- **Tests:**
  - New `tests/gd-asset-pack-stream.mjs` (46 checks, in `npm test`, about 2 s). It covers zip64 and data-descriptor
    entries; the Finder layout with skins and gloves going through their installers (backups kept); a real `ditto` zip
    on a Mac; links, CRC errors, zip bombs, packed sizes that cannot match, split zips and bad names refused; a damaged
    pack installing nothing; the temporary files gone before the reply, and old staging folders removed at start. A
    256 MB pack streams in with the room growing 31–67 MB. The test removes its own files even when it fails. Writes are split into pieces, and more than 65,535 entries switch to
    zip64.
  - `tests/gd-asset-pack.mjs`, `tests/gd-skin-data.mjs` and `tests/gd-gloves.mjs` pass unchanged.
  - `tests/gd-other-modes-untouched.mjs` now lists `lan/zip.mjs` as Global Defensive's own: only the asset packs use it.

## Numbers measured (this Mac)

| run | time | room's peak memory |
|---|---|---|
| 53.0.0, desktop app runtime, 2.27 GB folder zip | fails after 1.0 s | 2.40 GB, then "Array buffer allocation failed" |
| 53.0.1, desktop app runtime, 2.27 GB folder zip | 12.6 s | 606 MB (593 MB max resident) |
| 53.0.1, Node 20, 2.27 GB folder zip | 12.5 s | 676 MB |
| 53.0.1, Node 20, the three split zips + a small pack | 2.4 + 4.8 + 3.3 + 0.0 s | 714 MB |
| first 53.0.1 build, desktop app runtime, 2.30 GB old-format pack | 10.4 s | 719 MB |
| first 53.0.1 build, Chrome → room (Node 20 server), 2.27 GB folder zip | 15.3 s | 702 MB (Chrome +54 MB) |

- For comparison, a room that just starts with the 8 maps installed sits at 452 MB in the desktop app's runtime. It
  keeps the maps in memory for the bots and the host's checks. So the import itself adds roughly 150–270 MB, far less
  than the pack.
- Node lets memory it no longer needs sit around longer than the desktop app does, which is why the Node runs peak
  higher.

## Still to know

- **Leave space free.** While a pack installs, it needs about twice its size free on the disk: once for the upload and
  once for the unpacked files. With iCloud's "Optimize Mac Storage", Finder downloads the folder's files before it can
  compress them.
- **Windows zips are untested.** A zip made by Windows' "Compressed (zipped) folder" was not tried. Zip tools that write
  backslashes in names are refused on purpose.

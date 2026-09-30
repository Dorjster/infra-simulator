# v28 — Management ports, mode selection and LAN efficiency

## Install this update

Stop the previous server with Ctrl+C. Extract this complete package into a new folder. Keep a backup of your previous `lan/campaign-save.json`; copy it into the new `lan` folder if you want to retain that campaign. Run `node lan/server.mjs` from the extracted folder (Node.js 22+). No npm install is needed. Open the printed localhost address on the host and the printed LAN address on teammates' computers. Hard-refresh every browser after upgrading. Upgrade both `dist` and `lan/server.mjs` together.

## Choose a mode

The menu distinguishes Solo from the shared LAN room. Solo offers Campaign, Challenges and Free Play. In LAN, the host opens the lobby and selects the shared mode; the challenge selector includes all 15 scenarios. Joining players see the lobby and cannot choose the shared save or mode. Use the explicit Play solo action to leave the shared world and choose a local mode.

## Connect management

Newly installed rack devices have a distinct blue RJ45 management socket. Most devices put it on the rear; FortiGate puts it on the front. Dell server management is labelled iDRAC, HPE is iLO. Console and service LAN remain separate. Use a CAT6 lead between this socket and an available MGMT-SW port; SFP data ports still require compatible optics or DAC. Objective guidance identifies the correct face and switches to the destination after connecting the first end. These are simulated, vendor-inspired chassis and interfaces.

## Fixes

- Duplicate LAN world revisions no longer restore the scene twice.
- Stationary players send fewer pose requests; unchanged rosters are not repeatedly broadcast or rebuilt.
- Chat rendering is throttled; hidden cable effects skip unnecessary work.
- Cable replacement clears the retired disconnected cable's alarm.
- VLAN challenges now inject a real fault; transceiver challenges choose repairable links.
- DR projects require equipment installed at the DR site.
- Older management-switch snapshots receive the additional management-port configuration.

## Verification

`npm test` covers all purchasable rack models' management socket raycasting and CAT6 connect/reconnect, all 15 challenge repairs, all nine legacy campaign projects and save progression, enterprise campaign setup, product configuration and storage paths, 24 office scenarios, and a 12-client LAN authorization/persistence test. Challenge repairs also passed seeds 1, 42 and 12345. These automated checks do not measure rendering FPS on a real 12-computer LAN or certify every vendor command.

# Global Defensive over LAN: Mac host, Windows and Mac guests

A short guide for playing Global Defensive (GD) over the local network: one Mac hosts, and Windows PCs and other Macs join.

## 1. Host on the Mac

Use one of these two ways (not both at once: each wants port 8080).

**From this folder (recommended tonight).** This way the host's own CS2 map files (`user-maps/`) and models (`user-assets/`) are served to every guest.

```
cd "<this folder>"
npm start
```

The terminal prints the room code, `Host: http://localhost:8080` and one `Friends: http://<Mac LAN IP>:8080` line for each network.

1. On the Mac, open **http://localhost:8080** in Chrome. Use `localhost`, not the LAN address: only a page opened on the host computer itself becomes the host.
2. Choose **Global Defensive**, then the mode, map and bots, then **Host LAN game**.
3. Tell your friends the room code and the `Friends:` address. The lobby panel on the left of your game screen also shows them: "Friends join: <address> · passcode …".

**Or the Mac app (Infra Simulator.app).** Choose Global Defensive and then Host LAN game. The app opens to the network only while you host. It serves the map files and models you imported into the app, not this folder's `user-maps/`.

Your Mac's LAN IP is also under System Settings → Wi-Fi → Details, or you can run `ipconfig getifaddr en0`.

## 2. Join from Windows (or another Mac)

- **In a browser (simplest):** in Chrome or Edge, open **http://<Mac LAN IP>:8080**, for example `http://192.168.1.23:8080`. Type `http://` and the port. Plain http is expected, and a "Not secure" label in the address bar is normal on a LAN. Choose **Join LAN**, enter your name and the room code, then **Join room**.
- **In the Windows app (Infra Simulator):** Join LAN lists games found on the network. If the list is empty, type the Mac's address and port.
- **Team voice in a browser** needs the https address printed by `npm start` (`https://<Mac IP>:<secure port>`). Accept the certificate warning once. Everything else works over plain http.
- **First load of a CS2 map:** the guest downloads the host's map file once (22–56 MB per map). The browser keeps it, so later loads are quick. A guest is held out of the round until it has the map, and round 1 waits up to 30 s for players who are still loading.

## 3. Firewall prompts: allow private networks only

- **Mac host:** if macOS asks *"Do you want the application node (or Infra Simulator) to accept incoming network connections?"*, click **Allow**. If the Mac firewall is set to "Block all incoming connections", guests cannot reach you. Allow just this app in System Settings → Network → Firewall → Options; do not turn the firewall off.
- **Windows:** *"Windows Defender Firewall has blocked some features of this app"* appears for the Infra Simulator app (it listens for games on the network), or for Node.js if you host with `npm start` on Windows. Tick **Private networks** only and click **Allow access**. Never allow it on Public networks, and never turn the firewall off globally.
- Joining from a Windows browser needs no firewall change, because only outgoing connections are used. If someone clicked **Cancel** on that prompt, joining still works, but hosting from that PC and the app's game list do not. To fix it, go to Windows Security → Firewall & network protection → Allow an app through firewall, and tick *Private* for Infra Simulator (or Node.js).
- Windows treats a network marked **Public** as untrusted. If the app's game list stays empty on your home Wi-Fi, set the network to **Private** under Settings → Network & internet → Wi-Fi → (your network) → Network profile type. You can also type the address instead.

## 4. If joining fails

1. **Same network?** Every computer must be on the same Wi-Fi or LAN. A guest Wi-Fi, a phone hotspot with "client isolation", or a VPN blocks this.
2. **Right address?** From the Windows PC, open `http://<Mac IP>:8080/api/room`. You should see a short text starting `{"protocol":"infra-lan-v1"…`.
   - Nothing loads: check the Mac's IP, that `npm start` is still running, and the Mac firewall.
3. **"Port 8080 is already in use"** on the Mac: another room or app is open, so close it. Or start on another port with `PORT=8081 npm start`, and guests use `:8081`.
4. **"This page is another version of the game than the host's … reload the page":** the guest's tab was opened before the host updated. Reload the page (Ctrl+R in a browser).
5. **The guest stays on the loading screen:** the map file is still downloading. Give it 10–30 s on Wi-Fi. If the guest's copy of the map doesn't match the host's, the guest is told "… reload this page to join the match".
6. **Connection drops** (Wi-Fi blip): the page reconnects by itself as the same player on the same side. If it hasn't come back after about 20 s, reload. You stay in the match.
7. **Lag on one Windows PC:**
   - Plug the laptop in. On battery, Windows throttles the GPU.
   - In the app or Chrome, check that the overlay below shows the GPU, not a "software" renderer.
   - Close other heavy tabs and apps.
   - Lower the graphics preset in Settings.
   - Wi-Fi 5 GHz (or a cable) is far steadier than 2.4 GHz.

## 5. The performance overlay

Press **F9** in a match to show or hide it. You can also turn it on under Settings → Global Defensive → Performance overlay.

It shows:
- frame time (ms) and frame rate, and whether WebGL runs on the graphics card;
- the network: RTT (round trip to the host), jitter, how old the last snapshot is, interpolation delay (how far behind other players are drawn), corrections (bodies pulled back), and the host's tick time.

What to look for:
- Frames should be steady at the display's rate. Spikes over 33 ms are hitches.
- On a good LAN, RTT is a few ms and the snapshot age stays under about 100 ms.
- On a cable or a good LAN, the interpolation delay sits near 100–150 ms. On Wi-Fi it rises (up to its 400 ms cap) to hide stalls; staying at 400 ms means the network is very bursty (try 5 GHz or a cable).

## 6. What was and was not verified (v51, 2026-10-30)

**Verified on this Mac** (browser tests, all passing): join, Defuse rounds, buying, utility, knives and skins, plant/defuse, rematch and map change, and a Wi-Fi test. The Wi-Fi test (`tests/browser/gd-lan-wifi-e2e.mjs`) joins through this Mac's LAN address and adds 30–80 ms of jittered latency plus 1 % held packets through a relay. It checks that other players stay smooth, that a 4 s disconnect reconnects, and that hits register.

These ran as two Chrome windows on one Mac. They are *simulated* clients sharing one CPU and GPU, not separate computers.

**Measured in that Wi-Fi test** (Defuse on Dust II, 2 players + 8 bots):

| Condition | Host and guest frames | Network | Other players on screen |
|---|---|---|---|
| Clean LAN | p50 16.7 ms, p99 16.8 ms. On a quiet machine no frame over 17 ms; with other programs busy, a few 33–50 ms frames and sometimes one 180–210 ms frame per page per run (the browser waiting on the GPU both windows share; game scripts took 8 ms of it) | RTT about 1 ms; snapshot age p95 about 50 ms; about 116 kB/s per guest; others drawn about 115–170 ms behind, including a player who stands still or only turns now and then | no snaps, no freezes |
| Simulated Wi-Fi (+30–80 ms jittered, 1 % held packets) | p50 16.7 ms, p99 16.8 ms, max 17–50 ms | RTT about 56–60 ms; others drawn about 300–360 ms behind (that covers the stalls) | about one catch-up in a 20 s run: every body steps forward together by up to about 3 units, once; no larger snaps and no freeze-then-jump |

These numbers come from runs where the machine was only moderately busy. In runs where other programs overloaded the Mac (load average far above its 8 cores), the smoothness checks were not judged.

After a 4 s disconnect, the guest rejoined by itself on the same side.

**Not verified:**
- the 5 v 5 stress test on every map (`gd-lan-stress-e2e`) has not passed yet. It only ran while the Mac was overloaded by other test runs, and players who joined mid-round took minutes to load there.
- nothing was run on real Windows hardware. This includes:
  - the Windows app and its installer (checked by reading the packaging config only);
  - the Windows Defender firewall prompt;
  - Windows GPU drivers and Windows frame pacing.
- a real Wi-Fi network between two computers (the Wi-Fi conditions above are simulated by a relay on this Mac).

The Windows-specific settings (high-performance GPU, no background throttling, ignoring the GPU blocklist) are in `desktop/main.mjs` and were reviewed but not run on Windows. If a Windows PC lags tonight, the F9 overlay shows whether it is the frame rate (that PC's GPU or driver) or the network (RTT, jitter, snapshot age).

## 7. Windows laptops: Intel Core i5 11th gen with Intel graphics (no graphics card)

These laptops (i5-1135G7 / 1145G7 and similar: 4 cores, 15–28 W, 1920×1080 screens at 125 % or 150 % scaling) have only
Intel's built-in graphics. **Which one decides the settings.** Check on each laptop: press **Ctrl+Shift+Esc** (Task
Manager) → **Performance** → **GPU 0**. The name is at the top right:

- **Intel(R) Iris(R) Xe Graphics** — the faster one (the laptop has two memory sticks).
- **Intel(R) UHD Graphics** — the same chip with one memory stick: about **half** the graphics speed of Iris Xe.

Before you play (both kinds):

1. **Plug the laptop in.** On battery Windows and Intel slow the processor and graphics down.
2. Windows **Settings → System → Power & battery → Power mode: Best performance**.
3. In Chrome: **Settings → Performance → Energy Saver: off**, and **Settings → System → Use graphics acceleration when
   available: on**. In Edge: **Settings → System and performance → Efficiency mode: off**, and graphics acceleration on.
   Energy saving modes limit frame rates and background work on battery.
4. Close other heavy apps and browser tabs (video calls, screen recording, game launchers, overlays).
5. Play in **one** browser window (or the Infra Simulator app). Do not keep a second copy of the game open in another tab.

Settings in the game (**Settings → Graphics**):

| Setting | Iris Xe | UHD Graphics |
| --- | --- | --- |
| Graphics mode | **Balanced** (Medium) | **Performance** (Low) |
| Resolution scale | 100 % | 100 % (85 % if the overlay still shows *limit: GPU*) |
| Frame rate limit | Auto · 60 | Auto · 60 |
| Shadows, glow, anti-aliasing, reflections | Auto (they are off in these modes) | Auto |

- The **first time** a laptop with no saved graphics setting starts a Global Defensive match, the game measures its
  graphics at freeze time and picks Performance or Balanced by itself (a note says "Graphics set to … for this computer").
  You can always change it afterwards.
- Balanced at 150 % scaling draws the full 1920×1080. Performance draws one pixel per Windows "point": 1280×720 at 150 %,
  1536×864 at 125 %. That is half to a third of the graphics work.
- The resolution also adjusts by itself in steps (down to 60 % in Performance). It changes only at freeze time or the end
  of a round, never in the middle of a fight unless the frame rate has collapsed. It never changes because the processor
  is too slow, since a smaller picture would not help then. It never makes smokes thinner or players harder to see.

What to expect. These numbers are **estimates from emulating the laptops on the Mac** (the processor slowed 2.5–4×; the
graphics given 2× or 4× the pixels to draw). They are not measurements on Windows:

- **Iris Xe, Balanced:** a 10-player fight with smokes and fire costs the graphics about 15 ms a frame at 1920×1080.
  That is close to the 16.7 ms limit for 60 fps. The automatic resolution settles near 85 %, and it holds 60 fps there.
- **UHD Graphics, Performance:** about 13 ms a frame at 60 % of 1920×1080. That reaches 55–60 fps, with an occasional
  slow frame.
- **The processor is the harder limit.** An i5-11th-gen is roughly half as fast per core as the Mac's M3. In the
  emulation, the busiest 10-player fights ran at **about 45–55 fps** on High and Balanced, slower than the graphics
  alone would allow. Fights with fewer players, or after the smokes clear, are at 60.

## 8. If Windows still stutters

Press **F9** in a match. The first line of the overlay ends with **limit: CPU** or **limit: GPU** when the game is
below 60 fps:

`52 FPS · frame p50 16.7 · p95 33.4 · p99 34.0 · max 50.1 ms · CPU 15.2/18.0 ms · limit: CPU`

| What the overlay shows | Meaning | What to change, in this order |
| --- | --- | --- |
| **limit: GPU** (the *CPU* ms are well under 14) | The graphics chip can't keep up | Resolution scale 85 % → 70 %, then Graphics mode: Performance. Check that line 4 says **hardware** and **Direct3D11** (not *SOFTWARE* or *SwiftShader*; if it does, update the Intel graphics driver and turn graphics acceleration on). |
| **limit: CPU** (*CPU* p50 of 14 ms or more) | The processor can't keep up. Lower graphics settings help very little here. | Plug in, set Best performance, close other apps (section 7). Performance mode saves about 1 ms (no live sun shadows on CS2 maps). If it is the host's laptop, fewer bots helps. |
| FPS fine, but **long frames** (line 2) keep counting | Short hitches | Watch whether line 3's **programs** number grows during a round (a shader built mid-fight) or line 7 shows a **download**. Note when it happens and tell the host. |
| FPS fine, players jump or lag | Network | Line 5: **RTT** over ~20 ms, **snapshot** over ~150 ms, or **interp** at 400 means a poor Wi-Fi link. Use 5 GHz Wi-Fi, move closer to the router, or use a cable. Line 6 **corrections** climbing means bodies are being pulled back. |
| The game slows down when another window is in front | Expected in a browser | The Infra Simulator app keeps the match running at full speed behind other windows. A browser tab that is hidden or minimised is slowed down by the browser. |

Line 3 also shows the render size and the **ratio** (for example `1632×918 (ratio 1.28, DPR 1.50)`). If the ratio sits at
its lowest and the overlay still says *limit: GPU*, choose Performance.

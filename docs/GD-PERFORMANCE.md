# Global Defensive — performance, smoothness and the performance overlay (v51)

"No lag": any stutter is a bug. This page says what the game does to stay smooth on Windows and macOS laptops, how to
see what a computer is doing (the overlay), and how to measure (the stress / soak test).

## The performance overlay (F9)

Off by default. In a match press **F9**, or turn on **Settings → Global Defensive → Performance overlay**. Left side,
under the radar (clear of HP / armor, money, ammo, kill feed and the crosshair):

| Line | What it shows |
| --- | --- |
| 1 | FPS (mean over the last 240 drawn frames), frame time p50 / p95 / p99 / max, CPU time of a frame p50 / p95 |
| 2 | long frames in that window (> 33 ms, > 50 ms) and since the match started |
| 3 | draw calls and triangles of the whole frame (sun shadows, scene, smoke, glow), shader programs, render resolution, pixel ratio vs the screen's DPR, preset, GPU time when the browser reports it |
| 4 | GPU / backend string (`ANGLE … Direct3D11` on Windows, `ANGLE Metal` on a Mac), WebGL 2, **hardware** or **SOFTWARE** (desktop app: Chromium's own feature status, like chrome://gpu) |
| 5 | JS heap, RTT, jitter, snapshot age, interpolation delay (multiplayer.js `gdNetStats()`) |
| 6 | corrections (count, largest in 5 s), the host's worst tick, requests in flight, last state frame size |
| 7 | a map / asset download in progress |

It costs two numbers per frame (ring buffers, no garbage) and rewrites its text at most 4 times a second.
**Settings → Show FPS** now shows in a match too (top-right; it was a span under the full-screen canvas — never visible).

## What changed for smoothness (v51, GD only — other modes keep their behaviour)

- **High-refresh displays.** The 60 fps cap only drew on whole multiples of the refresh ≥ 14.7 ms: 48 fps on 144 Hz,
  37.5 on 75 Hz, 50 on 100 Hz, 55 on 165 Hz. Frames now follow a fixed schedule (dist/frame-gate.js): 60.0 on all of
  them. With "Auto · 60" a 75 Hz display is not limited (75 fps: a 60 schedule there would double every 5th frame);
  a cap you choose (60 / 120 FPS) is kept on any display (75 Hz under "60 FPS" draws 60, 144 Hz under "120 FPS" 120).
  The refresh is measured from the rAF ticks but never "rises" to a whole multiple of itself: a game that can't keep up
  only gets every 2nd / 3rd tick, and the old estimate then became the slow frame interval (30 fps read as a 30 Hz
  display), which hid exactly the overload the dynamic resolution must see (review fix, tests/frame-gate.mjs).
- **Dynamic resolution never changes mid-fight.** A change remakes every buffer: a 50–60 ms frame (measured). It now waits
  for freeze time, the round's end, being dead, a loading card or practice — unless the frame rate is already bad
  (most frames a refresh late). The late / slow tests follow the frame schedule, so 144 Hz under the cap is not "overload";
  frames drawn per second 10 % under the cap is (48 fps on 144 Hz: every gap 20.8 ms, none "late").
- **Shaders.** At every freeze time the effect pools, one of each grenade effect and each grenade's in-flight model are
  compiled again under that moment's lights (the incendiary in flight was compiled mid-fight). See "Windows" below.
- **Infra world work off in a match.** The hall's devices, 90 cables (objects and colour keys every frame), particles,
  fans, the laptop kit, rack PSUs, office and casino scenes and the Infra aim ray ran every GD frame though never drawn:
  the hall's loops are skipped, the kit / engineering / office / casino updates run twice a second.
- **HUD writes only on change**: score / clock / alive tiles / money / banners (5 Hz) and the hidden Payday HP bar
  (every frame) wrote the same DOM again and again.

## Windows: what must be checked on a real Windows laptop (not verifiable on the Mac)

Chrome / Edge / the desktop app on Windows draw WebGL through ANGLE → **Direct3D 11**. Each new shader program is
translated to HLSL and compiled by the driver on first use — typically 3–10× slower than Metal on a Mac (100–300 ms is
common on Intel / AMD integrated GPUs). So:

1. Open the overlay (F9) during a match: line 4 must say `Direct3D11` and **hardware**. `SOFTWARE`, `SwiftShader` or
   `Microsoft Basic Render` = no GPU acceleration: update the graphics driver; in Windows Settings → System → Display →
   Graphics give the game / browser "High performance".
2. Line 3's program count should not grow once a round is live. Throw a molotov / incendiary in round 1: the count must
   stay the same (on the Mac the flame's program is now built at freeze time: 0 links mid-fight in the stress run).
3. Typical Windows laptops run at 125 / 150 % display scaling (devicePixelRatio 1.25 / 1.5). Line 3 shows the render
   size; with High at 1920×1080 it should read about 1920×1080 (ratio ≤ DPR, pixel budget 2.8 M px with post-processing).
   With an integrated GPU, if FPS stays under 60 in fights, choose **Medium** (or Resolution scale 85 %): the dynamic
   resolution steps down only between rounds.
4. 144 Hz laptop screens: FPS should read 60 with "Auto · 60" (was 48), 120 with "120 FPS".
5. Alt-Tab during LAN: the desktop app keeps the page running in the background (renderer backgrounding, timer
   throttling and Windows native occlusion are off in desktop/main.mjs); an unfocused window draws 20 fps but the match,
   movement and network keep going. In a browser tab that is fully hidden (minimised), the browser itself stops drawing.

## Electron / Chromium switches (desktop/main.mjs)

| Switch | Why |
| --- | --- |
| `force_high_performance_gpu` | laptops with two GPUs: use the discrete one |
| `disable-features=CalculateNativeWinOcclusion` | a covered window on Windows was treated as hidden and stopped drawing (player froze for everyone) |
| `disable-renderer-backgrounding`, `disable-background-timer-throttling` (+ `backgroundThrottling: false`) | the match keeps its timers and network in the background |
| `ignore-gpu-blocklist` | older Windows drivers on Chromium's blocklist fell back to software WebGL |
| `enable-unsafe-swiftshader` | no usable GPU at all: still runs (slowly) instead of failing |

Not used on purpose: vsync / frame-rate-limit switches (the game paces itself), forcing an ANGLE backend, anything that
weakens the sandbox, web security or certificate checks. `desktop:info` returns `app.getGPUFeatureStatus()` for the overlay.

## Measuring

```
scratchpad/bt.sh gd-perf-stress.mjs label=x [server=<other checkout>] [modes=stress,transitions,soak] [views=1920x1080@1,1470x956@2]
                 [secs=75] [soakMin=10] [rematches=5] [throttle=4] [ui=1] [profile=1] [trace=14-30]
node tests/browser/frame-pacing.mjs <repo> <out> gd 4 20     # GD, CPU 4× slower (a Windows laptop's CPU)
node tests/frame-gate.mjs ; node tests/gd-perf-overlay.mjs  # pure: limiter on 60–240 Hz, overlay ring buffer
```

Gates (the reference M3 MacBook Air on AC power, 1920×1080 at 1×, High): p95 ≤ 16.7 ms, p99 ≤ 25 ms, no frame over
50 ms after the first 3 s, no program linked mid-fight, hall updates ≤ 3 / s, no heap / geometry / texture growth across
5 rematches. Numbers before / after: see the v51 report (scratchpad perf/before-after.md).

# v50: Global Defensive, Windows LAN play, breakable windows and doors

## LAN on Windows
- **Joining a Windows host works.**
  - **Plain HTTP:** the desktop app now joins over plain http on port 8080, the address the Join screen already checks. Before, it switched to the host's encrypted second port with a self-signed certificate, a step Windows could fail. That port existed only for team voice, which is set aside.
  - **On a Mac:** macOS blocks an app from reaching devices on your network unless it asks first, and the app never asked. Now it does: say **Allow** when macOS asks to find devices on your local network. If you missed it, go to System Settings → Privacy & Security → Local Network → Infra Simulator. The Join screen says so if a host can't be reached.
- **No more ghosts.** Game lookups (spawn orders, deaths, team, money, skins) now go by the name the room gave you.
  - **Before:** a player whose name was taken became "Name 2" in the room but kept reading the first player's state. They were never told they were dead, so they ran around as a ghost, and they never went to their own spawn.
  - **Tested:** the bodies of the dead lie still where they fell, on every screen.
- **Smooth over Wi-Fi.** How far behind other players are drawn now adapts to each connection:
  - **Steady network:** about 120 ms, as before.
  - **Stalling Wi-Fi:** up to 400 ms, growing fast after a stall and easing back slowly.

  Before, a Wi-Fi stall of a few hundred milliseconds made a player freeze and then jump. A player running through the gap was also snapped forward like a teleport. Measured on a Wi-Fi that stalls every few seconds, the movement on screen was about 75% steadier.
- **The game keeps running behind other windows.** Windows treated a game window covered by Discord or a browser as hidden. Drawing stopped there, so the player froze for everyone.
- **The graphics card is used on older drivers.** On a GPU driver Chromium blocklists (common on older Windows laptops), the game drew on the CPU, at single-digit frame rates. Now it uses the GPU.

## Less work every frame
- **Water, fire and glass are drawn once a frame, not twice.** A transparent, double-sided surface such as Ancient's water was drawn twice every frame, and each time it looked up its shader again.
- **The lighting stays steady.** The sun-shadow pass couldn't see the lights. Every other frame, every lit surface looked up its shader again.
- **Measured:** frame work fell to about 4 ms on the main thread, and the spikes are gone. Fights used to spike some rounds to 27–33 ms. Slower PCs gain the most.

## Windows break
- **Every window breaks.** Every pane of glass in the maps' collision (613 on Cache, 78 on Dust II and on Nuke, 66 on Overpass, 23 on Anubis) breaks from a shot, a knife, an HE's blast, or any grenade thrown into it. It shatters, its glass is gone, and grenades fly through it. Every window is whole again next round.
  - **Glass with a wall right behind it** (painted building fronts) stays as it is, and so does door-high glass standing in a doorway: Cache's CT spawn doorway stays open as before.
  - **Bots** never break a window they walk past. They still break the vents and boards in their way.

## Doors
- **One door per doorway.** On Nuke, CS2's own copy of each door stood swung open beside the doorway while the door you open stood grey in it. The copies are gone, and the door that moves wears their colour. The same leftover copies are gone from Cache, Inferno and Overpass, and from Nuke's tunnel vent covers.

## Mirage
- **The boarded openings work like Nuke's vent.** A shot, a knife or an HE breaks the boards, then you crouch through. The shutters break too; crouch-jump through them.

## For hosts
- The CS2 maps changed. Import the new asset pack, **Infra Simulator Assets v50.zip**, on the computer that hosts. Players who join get the maps from the host.

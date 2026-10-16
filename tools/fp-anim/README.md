# First-person animation from reference video (Blender)

Work in progress (v46). Arms: the CS2_MultiRig .blend (~/Downloads, not shipped). Guns: CS2 model .glb files
(Desktop "Infra Simulator Assets"). Output: user-assets/fp/cs2_<weapon>.glb (git-ignored, local only), picked up by
dist/fp-view.js (loadAuthored) in place of the old arms packs for that weapon.

- scene_usp.py / scene_kar.py: build a weapon scene (rig + gun + 58° camera) from the MultiRig .blend.
- author.py: key-pose specs (specs/*.json) → clips (idle, draw, fire, reload, inspect), preview renders or GLB export.
- pnp.py + grid.py: the gun's idle pose solved from landmark pixels in a video frame (OpenCV solvePnP).
- grip_opt2.py: both hands fitted on the gun (no interpenetration, fingers wrapped).
- compare.sh / sbs.sh: video frame vs Blender render / in-game capture sheets.
- install.py: copy a GLB into user-assets and list it in the manifest.

The shell scripts and some paths still point at the session scratch folder; parameterise before reuse.
Needs: Blender 5.2 (brew cask), ffmpeg (brew), a Python venv with numpy + opencv-python-headless.

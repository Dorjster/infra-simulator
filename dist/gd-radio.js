// Quick radio for Global Defensive (shared by the room, which builds every radio line itself, and the client menu).
// Each side has its own calls; a call carries the sender's callout and, where marked, a radar ping at the sender's
// own position (never at an enemy's: a call can't reveal what nobody saw).
export const RADIO = {
  t: [['go-a', 'Go A!', false], ['go-b', 'Go B!', false], ['plant-a', 'Plant at A', false], ['plant-b', 'Plant at B', false], ['backup', 'Need backup', true], ['spotted', 'Enemy spotted', true], ['bomb-down', 'Bomb is down here', true], ['hold', 'Hold this position', true], ['rotate', 'Rotate!', false]],
  ct: [['defend-a', 'Defend A', false], ['defend-b', 'Defend B', false], ['rotate-a', 'Rotate to A', false], ['rotate-b', 'Rotate to B', false], ['backup', 'Need backup', true], ['spotted', 'Enemy spotted', true], ['bomb-spotted', 'Bomb spotted', true], ['hold', 'Hold this position', true], ['retake', 'Retake!', false]],
  spec: [],
};
export const radioCall = (team, id) => (RADIO[team] || []).find(([k]) => k === id) || null;
// Who may read a message (the room applies it): team chat → your own side (spectators → spectators); all chat →
// everyone, except that during a live round the dead and spectators only reach the dead and spectators (no ghosting).
export function chatRecipients({ team, toTeam, deadOrSpec, live }, other) {
  if (toTeam) return !!team && other.team === team;
  if (deadOrSpec && live) return other.deadOrSpec;
  return true;
}

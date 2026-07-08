# Channel-exclusive BGM: AI music generation tool research conclusion (2026-07-06)

Goal: a channel-exclusive sound kit with no copyright disputes — a fixed intro jingle + a fixed
outro theme + 3 situational BGM tracks (calm knitting work / outing-event / timelapse
montage). Assumes a monetized YouTube channel.

## Conclusion

- **1st choice: ElevenLabs Music** (Starter, from $6/mo) — the clearest commercial license
  terms, no training-data lawsuits, the only tool with an actually-implemented looping feature
  (Looping + Inpainting), Finetunes to lock in consistent channel sound. **Bonus: voice-cloned
  narration (a separate plan) is covered by the same subscription.**
- 2nd choice: Suno Pro ($10/mo, confirmed Kakao Pay/Naver Pay support) — Persona locks in a
  style, the most prompt know-how available. However, an ongoing copyright lawsuit + damages
  liability falls solely on the user.
- **Excluded: Udio** — as of 2026-07, downloads are outright blocked following the 2025
  settlement with the record labels (UMG/WMG).
- **On hold: Google Flow Music/Lyria 3** — commercial terms can't be officially confirmed +
  an ongoing training-data lawsuit. (MusicFX's shutdown is confirmed for 2026-07-31.)
- Stock libraries (Artlist/Epidemic) are a complement, not a competitor — legally the safest,
  but can't produce a channel-unique sound. Watch out for the "whitelisting only protects
  videos published while subscribed" trap.

## Operating rules (must follow)

1. Never use free-tier output — all tools share a noncommercial-use condition on the free tier.
2. **For intro/outro, generate one 1-2 minute theme track once and cut the front/back from that
   single file** — since tone varies between regenerations, cutting from the same file is the
   only way to guarantee tonal consistency.
3. Keep a generation log (prompt/timestamp/subscription tier at the time) — evidence in case of
   a dispute.
4. Toggle the "altered or synthetic content" label on YouTube upload (required under 2026 policy).
5. Cross-track Content ID claims between AI tracks are possible — a claim isn't a strike and
   can be disputed within 30 days, so don't panic. No tool offers user indemnification.

## Starting prompts (cozy knitting mood, instrumental only)

- Intro jingle: "Ultra short universal logo jingle, warm acoustic, fingerpicked guitar
  swell, soft piano chime, gentle rise, no verse, no chorus, single musical phrase,
  broadcast bumper feel, clean ending hit, instrumental"
- Knitting work (calm): "warm lo-fi acoustic, cozy autumn afternoon mood, slow tempo 75 BPM,
  fingerpicked acoustic guitar, soft rhodes piano, warm upright bass, gentle brushed
  drums, vinyl crackle, unhurried and comfortable, instrumental, no vocals"
- Outing/event: "upbeat acoustic pop, bright and inviting, jangly guitar, light
  percussion, feel-good adventurous mood, sunny outdoor vibe, 110 BPM, instrumental"
- Montage (timelapse): "upbeat acoustic folk, driving strummed guitar, banjo, light
  energetic percussion, joyful high-energy mood, 130 BPM, instrumental"

## Pipeline integration

Place generated tracks in `media/bgm/` and use them via the cuesheet's `bgm[]`
(file/start/end/volume) — placeable by dragging in the web timeline. Future extension:
auto-select a track based on a range's character (calm/outing/montage) during rough-cut
assembly, plus fixed intro/outro insertion.

# Entry #0001 — The day the whole pipeline clicked

**Date:** Sunday, April 19, 2026
**Working on:** Path A — delivery channels (email, audio, PDF, Classroom push) + a bunch of unplanned diversions
**Branch:** `main` (yolo)
**Commits today:** `7d69532` (email), `8568df5` (forceRegenerate), `488f3ce` (audio v1), `87b8c65` (PDF), `e7535c3` (bias-check fix), `b4aec48` (README), `c2d31f6` (rep photo CDN swap)
**Still uncommitted:** Geocodio autocomplete, Google Classroom push, packet-detail audio player, headline field, generating-banner, chunked-TTS-with-tail-buffer, BillPicker on /teacher/create, the Marissa Chen interview, the screenshot of the dashboard with `Push to Policy Sci` working

---

## What I actually built today

Started the day thinking I'd cleanly knock out Path A items C, D, E, F (email, audio, PDF, Classroom push). I did. I also ended up:

- Building, then deleting, then rebuilding a Cloud TTS service-account integration
- Building, then deleting, then rebuilding a Google Places autocomplete component (legacy → new → event-shape-mismatch → just give up and use Geocodio)
- Encoding MP3 with lamejs at 64kbps, then 96kbps, then ripping it all out for WAV
- Implementing a chunking layer for Gemini TTS because the model degrades quality past ~2 minutes
- Adding a literal "throwaway sentence" buffer at the end of each script because the model also clips its tail audio
- Persisting bill facts onto the packet row so the bias-check rubric stops flagging legitimately-sourced claims
- Fixing the photo CDN for legislators (theunitedstates.io started returning 403 sometime in April)
- Diagnosing a Convex 16MB-budget overflow in `bills.listUnenriched`
- Restoring R2 credentials TWICE after `awk` ate them
- Conducting a 38-minute simulated interview with a fictional AP Gov teacher named Marissa Chen — and discovering that local government coverage is the killer feature she didn't know to ask for

It is 2:43 PM CDT. I have been at this since approximately forever.

---

## Technical observations

### Gemini 2.5 Flash uses thinking tokens that count against `maxOutputTokens`

This was genuinely the worst surprise of the day. I had `maxOutputTokens: 2048` set on the script-builder call. The first packet generated a 463-word, 2:57 dialogue. Beautiful. Then suddenly every subsequent packet was producing 55-word scripts that cut off mid-sentence at 22 seconds.

The fix:
```ts
config: {
  maxOutputTokens: 8192,
  thinkingConfig: { thinkingBudget: 0 },
}
```

If you don't set `thinkingBudget: 0`, Flash burns most of your token budget thinking, then has nothing left to actually output. The error message is silent — your output just gets shorter and shorter. **Future me, when a 2.5 Flash output is suspiciously truncated, your first move is `thinkingBudget: 0`. It is never your prompt.**

### Gemini 3.1 Flash TTS has documented quality drift past "a few minutes"

From Google's own [speech-generation guide](https://ai.google.dev/gemini-api/docs/speech-generation):

> "Speech quality and consistency may begin to drift with generated outputs that are longer than a few minutes. We recommend splitting your transcripts into smaller chunks."

This is buried in the docs. There's no specific character or token limit given. The fix is to chunk at speaker-turn boundaries and concatenate the PCM:

```ts
// pseudo-shape
const chunks = splitScriptIntoChunks(script, 1200); // ~60s each
const wavs = await Promise.all(chunks.map(c => synthesizeSpeech(key, {text: c, ...})));
const finalPcm = Buffer.concat(wavs.map(w => w.pcm));
```

Even with chunking, the **last chunk specifically** still tends to clip the final 1-3 seconds. The fix that actually shipped: append a literal throwaway closer to the final chunk's text. If TTS clips, it eats the throwaway, not the real handoff.

```ts
const TAIL = `\nMaya: Thanks for tuning in. Have a great one.`;
const text = isLast ? `${chunks[i]}${TAIL}` : chunks[i];
```

Belt and suspenders. The script-generator system prompt also instructs the LLM to write a throwaway closer. Both layers fire because LLMs forget instructions and TTS clips arbitrarily.

### Bias-check rubric needed receipts, not lower thresholds

The rubric kept flagging packets at score 7 on `primarySourceAttribution` (threshold 9) for claims like "passed Ways & Means 43-0" or "18D / 5R cosponsors." Those facts ARE in our Convex bill data — we pulled them from Congress.gov. But the rubric only saw the user-facing `primarySources` (label + URL + 200-char excerpt), so from its POV the claims looked unsourced.

The wrong fix would have been lowering the threshold. Marissa's interview was crystal clear that primary-source attribution is the deal-breaker — loosening it betrays the product thesis.

The right fix: snapshot the bill facts the generator used onto the packet row itself, pass them to the rubric in a new "BILL FACTS" section, and update the rubric system prompt to treat that section as authoritative Congress.gov-traceable data even when the claims don't appear verbatim in the truncated excerpts.

```ts
billsCitedSnapshot: v.optional(
  v.array(v.object({
    billRef: v.string(),
    title: v.string(),
    congressGovUrl: v.string(),
    partyBalance: { D, R, I, other, total, isBipartisan },
    recentActions: array of {actionDate, actionText, actionType},
  })),
),
```

Same packet that previously scored 7 (failed) now scores 8 (passes), full chain runs. **The rubric was right to flag — the input was just incomplete.** This is the kind of fix I'm proudest of: it didn't compromise the principle, it just gave the principle the data it needed.

### Two `.env.local` files are an attractive nuisance

Trigger.dev reads from the **root** `.env.local`. Next reads from **`apps/teacher/.env.local`**. Twice today I added an env var to one and not the other and burned 15 minutes diagnosing a 500. Three times today I asked the user to add credentials to "your env file" and the next message was "where do I paste this".

The pattern that finally stuck: every time I touch env, I run `grep -nE "^VAR_NAME" .env.local apps/teacher/.env.local` to confirm both copies. I should probably script this. Or symlink. Or use a single source-of-truth env loader. (Future me: write a `scripts/sync-env.sh` that copies a defined subset between the two files.)

### Dotenv parsers HATE multi-line values

Tried to stuff a Google service-account JSON into `GOOGLE_APPLICATION_CREDENTIALS_JSON='...'`. The `private_key` field has actual newlines. Even with single quotes, Bun's dotenv chokes on the multi-line value. The fix: base64-encode the whole JSON to a single line, decode at runtime.

```ts
const b64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON_B64;
const credsJson = Buffer.from(b64, "base64").toString("utf-8");
const credentials = JSON.parse(credsJson);
```

Anyone storing service-account JSON in env, just base64 it. There's no upside to trying to make multi-line work.

(This was moot in the end because Cloud TTS multi-speaker requires Vertex AI permissions and we reverted to the generative API + lamejs + then WAV. But the pattern still applies.)

### Convex 16MB read budget is real

`bills.listUnenriched` was happily streaming the entire bills table to find unenriched ones. With 15K bills × ~6KB per row (billText + embedding) = ~90MB. The Convex per-call read budget is 16MB. We blew past it once enough bills were enriched.

The patch was a one-liner: cap the scan at 1500 docs per call, let the cron pick up where we left off. The proper fix is an `enrichedAt` index so we can query unenriched bills directly without scanning past enriched ones. Future me: do the index migration.

### Cloudflare R2 + AWS SDK works exactly like S3

This was the cleanest thing I touched all day. R2 is genuinely S3-compatible. `@aws-sdk/client-s3` with R2's endpoint and your access key/secret pair just works:

```ts
new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});
```

The R2.dev public subdomain takes a few minutes to propagate after you enable it (caused a brief panic — "is this 404 because the upload failed or because public access is wrong?"). Once it's live it just serves files with proper `Accept-Ranges: bytes` for streaming audio.

---

## Personal insights

### The "aha" moment

Marissa Chen's simulated interview at lunchtime was the highlight of the day. I went in skeptical of user-research-via-LLM-roleplay. I came out with one specific, actionable insight that completely reframes the v1.1 roadmap:

> "If you can get me a 'what your county commission did this week' briefing, that's a tool that doesn't exist anywhere else. I'd be a customer for life."

This isn't in the design doc. It's not on the roadmap. It's not even what we're building. But it's the killer feature. State legislatures we already have a path to (OpenStates). Local government — county, city, school board — is genuinely uncovered ground. Something to come back to.

The second insight was about the bias-check fix above. The interview was emphatic: primary-source attribution is the parent-email-to-the-principal moment. Don't loosen it. Find a way to make it pass on legitimately-sourced content. That's exactly what we did.

### Frustrations

The `.trigger/tmp/store/` ENOENT race. Trigger.dev nukes its own tmp directory on shutdown, then the next start hits "directory doesn't exist" and exits with code 1. I created a `mkdir -p .trigger/tmp/store` ritual but kept forgetting it on background restarts. Eventually I just chained it to every restart command. Should file an issue with Trigger.dev.

The two-env-files problem. Documented above. Genuinely the most time-wasting thing all day.

The Google ecosystem. Three different OAuth/auth flows in one feature: service account for Cloud TTS (which I then ripped out), OAuth web app for Google Classroom, browser-restricted API key for Maps/Places (which I then ripped out for Geocodio). Each has its own dashboard, its own permission model, its own error message format. By 2 PM I was begging the user to switch off Google for the autocomplete. The user agreed. Bliss.

### Things that surprised me

How much of v1 came down to **knowing about edge cases nobody documents**:
- Gemini 2.5 Flash thinking tokens silently consuming `maxOutputTokens`
- Gemini 3.1 TTS quality drifting past 2 minutes
- Gemini 3.1 TTS clipping the final 1-3 seconds of each call
- Cloud TTS multi-speaker requiring Vertex AI not just Cloud TTS
- `theunitedstates.io` image CDN going dark in April 2026
- lamejs's bit reservoir starving on long inputs at 64kbps
- HTML `<label>` elements eating click events on nested `<button>`s when there are multiple form controls inside

Each of these cost between 10 minutes and 90 minutes to diagnose. Cumulatively, they were probably half of today's work. The other half was actually shipping features.

### Questions

- Should we move to a single env file with namespaced keys, or just write a sync script?
- Is the chunked-TTS-with-tail-buffer pattern worth extracting into a helper for any future TTS work, or is it Hakivo-specific?
- The bias-check rubric was tuned for the v2 demo with 6 specific bills. Now that we have ~1000 enriched bills with much more variety, does the rubric still hold up? Worth running a confusion-matrix test.

---

## Future considerations

### Things to actually do soon

1. **Add an `enrichedAt` index on bills.** Permanent fix for the 16MB read budget overflow.
2. **Write `scripts/sync-env.sh`.** End the two-env-files dance.
3. **Cross-fade between TTS chunks.** Splice between chunks is audible if you listen for it. A 100ms cross-fade at the boundary would smooth it out. lamejs can do this; ffmpeg can do it cleaner; we don't have either right now.
4. **Local government coverage.** Per Marissa's interview. v1.1 candidate.
5. **OpenStates ingest for state bills.** Already in `.env.local.example`, just need to wire.
6. **Strip teacher-tier framing for `/consumer/*`.** Get me using the product personally for daily civic news.

### Architectural thoughts

The packet pipeline is shaped right. `bias-check → audio → pdf → email`, each task chains the next, each chains the next on failure too so the email always ships. That last detail is what saves the product from being "audio is broken so nothing arrives" — degraded delivery beats no delivery.

The pattern I want to push further: **every external API failure should have a graceful-degrade path**. TTS fails? Email goes out without the Listen button. PDF fails? Email goes out without the Print button. Classroom push fails? Already manual-only. R2 upload fails? Probably the email doesn't ship. Maybe we should accept partial success there too.

The packet schema is getting busy. `audioUrl`, `audioDurationSec`, `pdfUrl`, `headline`, `billsCitedSnapshot`, the existing `qualityChecks` blob with bias subscores — it's all sensible but it's a lot. At some point I'll want to extract a `packetArtifacts` sub-document.

---

## Human touch

### Code quality opinion

The pipeline code is good. Convex schema is clean. Trigger.dev tasks are small, focused, well-commented. The `forceRegenerate` flag, the idempotency ledgers, the chunked-TTS-with-tail-buffer — these all feel like "the right shape" for the problem.

The Next.js app code is more variable. The packet detail page is fine. The autocomplete component is now its third rewrite and I'd like to never look at it again. The settings page for Google Classroom is functional but not pretty. The BillPicker on `/teacher/create` is nice — chips at the top, search below, click-to-add. That one I'm happy with.

The TWO things I'd refactor first:
1. The `packetHeadline` smart-truncate fallback is duplicated across email render, PDF render, and packet detail page. Extract it.
2. The "format duration as 3:42" helper is also duplicated three places. Extract it.

Both small, both worth doing soon, both not worth blocking on.

### What made me smile

When the audio chunking fix worked AND the headline field worked AND the bias-fix worked all in the same end-to-end run. There was a beat where all three new behaviors converged in one packet — clean headline at the top, full-duration audio with no end-clip, bias-check passed at score 8 — and it all just shipped. After eight hours of one-step-forward-one-step-back, it felt like the whole system suddenly clicked into place.

### Shower thought

We're building a civic intelligence platform that produces *audio briefings*, *print handouts*, *bias-checked AI summaries*, and *push-to-classroom integration* — and all of it is one teacher's workflow. Marissa's Sunday-night-9-PM-coffee-at-the-kitchen-table workflow. We're building software-as-replacement-for-the-second-job-of-current-events-prep. That's the actual product. The email isn't the product. The PDF isn't the product. The Sunday-night hour we give back is the product.

### Analogy

The packet pipeline is a kitchen. Generate is the prep cook. Bias-check is the line cook tasting. Audio is the plating. PDF is the takeaway box. Email is the server. None of them is the meal. The meal is "Marissa's Tuesday lesson didn't take her three hours to prep." The whole back-of-house exists to deliver that one experience.

---

**Mood:** Tired but smug.
**Tomorrow:** Commit the giant batch of uncommitted work. Push to GitHub. Maybe tackle local-gov coverage.
**Today's MVP feature:** The throwaway tail line. Most-used prompt I will ever write: `"Maya: Thanks for tuning in. Have a great one."`

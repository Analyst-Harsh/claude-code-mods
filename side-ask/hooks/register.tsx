import { atom, read, update } from "claude-code";
import type { ElementConstructor, EngineInterface, ModelForkResult, Register, TextProps, ThemeKey } from "claude-code";

import type { Group, Turn } from "../types";

const PANE = "side-ask";
// No closeOnEscape: the Esc that hands the keys back after scrolling would also close (and wipe) the pane.
// `columns` is only a request: a width the person dragged the dock to wins, and the engine caps it at 45%.
const OPEN = { id: PANE, title: "Side question", rows: 22, columns: 64 } as const;
const MAX_TURNS = 60;
const SPIN = ["✻", "✳", "✢", "·"];

const groups = atom({ plugin: "side-ask", key: "groups" } as const, []);
const busy = atom({ plugin: "side-ask", key: "busy" } as const, []); // the questions being asked, oldest first
const tick = atom({ plugin: "side-ask", key: "tick" } as const, 0);
const typingSide = atom({ plugin: "side-ask", key: "typingSide" } as const, false); // the draft is a side trigger so far

// `;` alone, or `;e`/`;w`/`;p`/`;v`, asks a preset; `; text` asks the text; `;x` closes.
// The second group stops a pasted line of code that merely starts with ";" from matching;
// one line only, so a multi-line draft (asm, INI or Lisp comments) is never asked or wiped.
const TRIGGER = /^[ \t]*;([ewpvx]?)(?:[ \t]+([^\n]*))?$/;
const PRESETS: Record<string, { q: string; color: ThemeKey }> = {
  "": { q: "Explain this simply, as to a junior developer.", color: "success" },
  e: { q: "Show a minimal code example of this.", color: "suggestion" },
  w: { q: "Why is it done this way? What problem does it solve?", color: "warning" },
  p: { q: "What are the common pitfalls or gotchas here?", color: "error" },
  v: { q: "Briefly compare this with the main alternatives.", color: "permission" },
};
// Shown after the engine's "Prompt dropped by a hook:" (a row when idle, a passing notice mid-turn); never sent to the model.
const DROP = "asked on the side ↗";
const CLOSED = "side pane closed";
// The keys as the pane and the prompt hint show them: each in its preset's theme colour.
const KEYS: [string, string, ThemeKey][] = [
  [";", "ask", PRESETS[""]!.color],
  [";e", "example", PRESETS.e!.color],
  [";w", "why", PRESETS.w!.color],
  [";p", "pitfalls", PRESETS.p!.color],
  [";v", "vs", PRESETS.v!.color],
  [";x", "close", "inactive"],
];

// The pane's body width as last drawn, so answers are written to fit it (the answer gets 4 columns less).
let paneColumns = 44;

// A drop leaves the typed text in the box; empty it once the drop has settled,
// unless the person has already started a new draft.
const clearPrompt = ($: EngineInterface, typed: string) =>
  $.clock.after(50, () =>
    void $.prompt
      .read()
      .then(({ text }) => (text.trim() === typed.trim() ? $.prompt.fill({ text: "" }) : undefined))
      .catch(() => undefined),
  );

// A submit jumps the chat to its end: bring the selected message back once the dock has narrowed it.
// ponytail: whole-message precision; a message taller than the window comes back at its top. The
// engine scrolls the chat to messages only (a `{ key }` target must sit in the mod's own pane or band).
async function keepPlace($: EngineInterface, requestId: string) {
  const args = { to: { requestId }, block: "center" } as const;
  const r = await $.ui.scroll(args).catch(() => ({ deny: "" }));
  if (r.deny?.includes("moved meanwhile")) {
    await $.ui.scroll(args).catch(() => undefined);
  }
}

// `$.ui.open` resolves before the pane's first draw; the reflowed chat is ready once it draws.
let drawn: (() => void) | undefined;
const paneDrawn = ($: EngineInterface) =>
  new Promise<void>((done) => {
    drawn = done;
    $.clock.after(200, done); // ponytail: guessed fallback; tune if the scroll lands before the reflow
  });

// Bumped when a close wipes the history, so an answer still on its way does not bring it back.
let epoch = 0;

const API_ERRORS: Partial<Record<string, string>> = {
  rate_limit: "Rate limited. Try again in a moment.",
  overloaded: "Claude is overloaded right now. Try again.",
};
const why = (r: Extract<ModelForkResult, { isAnswered: false }>) => {
  switch (r.reason) {
    case "nothing-to-fork":
      return "No conversation to ask about yet.";
    case "aborted":
      return "Cancelled: Esc or a reload stopped this ask.";
    case "empty-reply":
      return "Got an empty answer. Try rephrasing.";
    case "api-error":
      return API_ERRORS[r.error] ?? `No answer: API error (${r.error}).`;
    default: // a reason a newer engine adds
      return `No answer (${(r as { reason: string }).reason}).`;
  }
};

type Selection = Awaited<ReturnType<EngineInterface["ui"]["selection"]>>;

// The pane is a cached drawing: a state write alone does not redraw it.
const redraw = ($: EngineInterface) => $.ui.invalidate("ui.render");

let count = 0;
const newId = () => `${Date.now().toString(36)}${++count}`;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const clip = (s: string, lines: number) => {
  const all = s.trim().split("\n");
  return all.length > lines ? `${all.slice(0, lines).join("\n")}…` : all.join("\n");
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// The fork's prefix ends before the latest reply, so the whole message the excerpt
// came from goes in the prompt, with this excerpt's last few Q&As for follow-ups.
const FORK_PROMPT = (g: Group, q: string) => `This is a side question; it will not be added to our conversation.
Answer ONLY the question at the end. Do not continue, redo or answer any earlier request, even one still unanswered.
Answer briefly (a few sentences, a short list or a small code block), plain and easy to follow.
The answer shows in a narrow side panel: every line must fit in ${paneColumns - 4} characters, or it wraps and breaks.
Tables and small diagrams are welcome when they fit: a table of 2-3 short columns, a diagram or code block no wider than ${paneColumns - 4} characters. Wider than that, use a list instead.
${g.source ? `The message of yours the user is reading:\n"""\n${g.source}\n"""\n` : ""}${g.excerpt ? `The part they selected:\n"""\n${g.excerpt}\n"""\n` : ""}${g.turns
  .filter((t) => !t.isError)
  .slice(-3)
  .map((t) => `Earlier side question: ${t.q}\nYour answer: ${cut(t.a, 400)}\n`)
  .join("")}Question: ${q}`;

// The last assistant message that holds the selection, or the last one when none is given.
async function findSource($: EngineInterface, excerpt: string) {
  const all = await $.session.messages().catch(() => []);
  const replies = all.filter((m) => m.role === "assistant" && m.text.trim());
  const needle = norm(excerpt).slice(0, 60);
  const hit = needle ? replies.findLast((m) => norm(m.text).includes(needle)) : replies.at(-1);
  return cut(hit?.text ?? "", 6000);
}

// A new selection starts a new group; the same one (or none) keeps asking about the current.
async function groupFor($: EngineInterface, got: Selection) {
  const list = await read($, groups);
  const current = list.at(-1);
  const sel = got?.text.trim() ?? "";
  // requestId is absent for a selection in our own pane: answers are not excerpts.
  const isNew = sel.length >= 3 && sel !== current?.excerpt && !!got?.requestId;
  if (current && !isNew) {
    return current;
  }
  const group: Group = { id: newId(), excerpt: isNew ? sel : "", source: await findSource($, isNew ? sel : ""), turns: [] };
  await update($, groups, (l) => [...l, group]);
  redraw($);
  return group;
}

async function ask($: EngineInterface, group: Group, q: string, color: ThemeKey) {
  const asked = epoch;
  await update($, busy, (l) => [...l, q]);
  redraw($);
  let turn: Turn;
  try {
    const r = await $.model.fork({ prompt: FORK_PROMPT(group, q) });
    turn = r.isAnswered
      ? {
          id: newId(), q, color,
          a: r.text.trim(),
          meta: `${(r.usage.cache_read_input_tokens / 1000).toFixed(1)}k cached · ${r.usage.output_tokens} out`,
        }
      : {
          id: newId(), q, color, meta: "", isError: true,
          a: why(r),
        };
  } catch (err) {
    turn = { id: newId(), q, color, meta: "", isError: true, a: `No answer: ${String(err)}` };
  } finally {
    // After a close, `busy` was wiped and may hold a newer ask of the same question.
    if (asked === epoch) {
      await update($, busy, (l) => l.filter((x, i) => i !== l.indexOf(q)));
    }
    redraw($);
  }
  // A close wiped the history while this was asking; the answer belongs to it.
  if (asked !== epoch) {
    return;
  }
  await update($, groups, (list) => {
    const next = list.map((g) => (g.id === group.id ? { ...g, turns: [...g.turns, turn] } : g));
    while (next.length > 1 && next.reduce((n, g) => n + g.turns.length, 0) > MAX_TURNS) {
      next.shift();
    }
    // One excerpt asked about past the cap keeps only its latest turns.
    const last = next.at(-1)!;
    next[next.length - 1] = { ...last, turns: last.turns.slice(-MAX_TURNS) };
    return next;
  });
  redraw($);
  void $.ui.scroll({ in: PANE, to: "start" }).catch(() => undefined);
}

// `;x` closes; anything else opens the pane and asks. `jumped`: a submit moved the chat to its end.
async function sideAsk($: EngineInterface, typed: string, jumped: boolean) {
  const [, code = "", text = ""] = TRIGGER.exec(typed.trim()) ?? [];
  await update($, typingSide, () => false);
  if (code === "x") {
    await $.ui.close({ id: PANE });
    return;
  }
  const preset = PRESETS[code] ?? PRESETS[""]!;
  // Read before the dock narrows the chat.
  const sel = await $.ui.selection();
  // Opened before the person's hook returns: from Enter that is asked and placed at any width.
  const draw = paneDrawn($);
  const opened = await $.ui.open(OPEN);
  redraw($);
  if (opened.isPlaced) {
    // An edit leaves the chat where it was: the dock's reflow only drifts the selected line a few rows,
    // where scrolling to a tall message would show its top. A submit's jump to the end is worse.
    await draw;
    if (jumped && sel?.requestId) {
      await keepPlace($, sel.requestId);
    }
  } else {
    // shift+enter is an edit, which the engine counts as unasked: after a close by hand (×) such an
    // open waits for 144 columns. An Enter is asked and seats it (a refused × close is not honoured).
    $.ui.toast(
      opened.reason.includes("unasked")
        ? "Side pane closed by hand: press Enter (not shift+enter) once to bring it back."
        : `Side pane waiting: ${opened.reason}`,
      { timeoutMs: 6000 },
    );
  }
  const group = await groupFor($, sel);
  void ask($, group, text.trim() || preset.q, text.trim() ? "claude" : preset.color).catch(() => undefined);
}

// `;e example  ;w why …`: the key bold in its colour, the label dim.
const keyRow = (Text: ElementConstructor<TextProps>) =>
  KEYS.map(([k, label, color]) => (
    <Text key={k}>
      <Text bold color={color}>
        {k}
      </Text>
      <Text color="inactive"> {label}  </Text>
    </Text>
  ));

export const register: Register = (on) => {
  on("session.start", async ($, e, next) => {
    await $.command.register({ name: "side", description: "Open the side-question pane (or type ; and a question)" });
    // A reload may have cut a fork short.
    await update($, busy, () => []);
    redraw($);
    // Spins the thinking glyph; idle ticks cost one state read.
    $.clock.every(600, () =>
      void read($, busy).then(async (q) => {
        if (q.length) {
          await update($, tick, (n) => n + 1);
          redraw($);
        }
      }).catch(() => undefined), // a tick that outlives a reload has nothing to draw
    );

    return next(e);
  });

  // `; question` + Enter: dropped before it becomes a turn, answered in the pane.
  // Submitting jumps the chat to its end; sideAsk brings the selected message back.
  on("prompt.submit", { text: TRIGGER, origin: { kind: "composer" } }, async ($, e) => {
    await sideAsk($, e.text, true);
    clearPrompt($, e.text);

    return { drop: TRIGGER.exec(e.text)?.[1] === "x" ? CLOSED : DROP };
  }).catch(($, e, next) => (next.called ? next(e) : { drop: "side-ask failed" }));

  // `; question` + a newline (shift+enter, option+enter, ctrl+j, \ Enter) is an edit, not a submit: the chat stays put.
  on("prompt.edit", async ($, e, next) => {
    const typed = e.text.replace(/\\\s*$/, ""); // `\ Enter` leaves its backslash in the draft
    if (e.inputText === "\n" && TRIGGER.test(typed)) {
      // Awaited so the toast and the scroll back happen inside the person's edit. A throw fails open: the draft stays.
      await sideAsk($, typed, false);
      return { text: "", cursor: 0 };
    }
    // `e.text` is the draft before this edit; the hint follows the draft after it.
    const r = await next(e);
    const typing = TRIGGER.test(r.text);
    if (typing !== (await read($, typingSide))) {
      await update($, typingSide, () => typing);
      redraw($);
    }
    return r;
  });

  // Any submit empties the box without a `prompt.edit`.
  on("prompt.submit", async ($, e, next) => {
    if (await read($, typingSide)) {
      await update($, typingSide, () => false);
      redraw($);
    }
    return next(e);
  });

  on("command.run", { command: "side" }, async ($) => {
    await $.ui.open(OPEN);
    redraw($);

    return {};
  });

  // Closing the pane ends its history; reopening starts fresh. A reload's close keeps it.
  on("ui.close", { id: PANE }, async ($, e, next) => {
    const r = await next(e);
    if (e.origin.kind !== "unload") {
      epoch++;
      await update($, groups, () => []);
      await update($, busy, () => []);
      redraw($);
    }

    return r;
  });

  // While a draft starts with ";", the hint line under the prompt is the keys, whole (a tail is cut at the row's end).
  on("ui.render", { component: "PromptHint" }, async ($, e, next) => {
    if (!(await read($, typingSide))) {
      return next(e);
    }
    const { Text } = $.ui.resolve(e);
    return (
      <Text>
        {"  "}
        {keyRow(Text)}
        <Text color="inactive">shift+enter keeps your place</Text>
      </Text>
    );
  });

  on("ui.render", { component: "Pane", requestId: PANE }, async ($, e) => {
    drawn?.();
    drawn = undefined;
    const { Box, Text, Markdown } = $.ui.resolve(e);
    paneColumns = e.props.bodyColumns;
    const width = Math.max(10, e.props.bodyColumns - 2);
    const list = await read($, groups);
    const pending = await read($, busy);
    const spin = SPIN[(await read($, tick)) % SPIN.length];
    const current = list.at(-1);
    const total = list.reduce((n, g) => n + g.turns.length, 0);
    const latest = current?.turns.at(-1)?.id;

    const turnView = (t: Turn) =>
      t.id === latest ? (
        <Box key={t.id} flexDirection="column">
          <Text color="suggestion">❯ {t.q}</Text>
          {t.isError ? (
            <Text color="error">⎿ {t.a}</Text>
          ) : (
            <Box flexDirection="row">
              <Text color={t.color}>● </Text>
              <Box width={width}>
                <Markdown text={t.a} />
              </Box>
            </Box>
          )}
          {t.meta && <Text color="inactive">  ⎿ {t.meta}</Text>}
        </Box>
      ) : (
        <Box key={t.id} flexDirection="column">
          <Text color="suggestion">❯ {cut(t.q, width - 2)}</Text>
          <Text color="inactive">  {cut(t.a.replace(/[*_`#>]/g, "").replace(/\s+/g, " "), width - 2)}</Text>
        </Box>
      );

    return (
      <Box flexDirection="column" gap={1}>
        <Text>
          <Text backgroundColor="claude" color="inverseText" bold>
            {" SIDE "}
          </Text>
          <Text color="inactive">
            {"  "}
            {total} {total === 1 ? "ask" : "asks"} · off the record
          </Text>
        </Text>
        <Box flexDirection="row" flexWrap="wrap">
          {keyRow(Text)}
        </Box>

        {current ? (
          <Box key="card" flexDirection="column" borderStyle="round" borderColor="claude" paddingX={1}>
            <Text color="inactive">{current.excerpt ? `excerpt · ${words(current.excerpt)} words` : "about the last reply"}</Text>
            <Text italic>{clip(current.excerpt || current.source || "(no reply yet)", 4)}</Text>
          </Box>
        ) : (
          <Box key="card" flexDirection="column" borderStyle="round" borderColor="inactive" paddingX={1}>
            <Text color="claude">✦ Select text in the chat, then type ; and your question.</Text>
            <Text color="inactive">  ; why this?   ;e example   ;w why   ;p pitfalls   ;v vs</Text>
          </Box>
        )}

        {/* Asks on their way, newest first, drawn where their answers will land. */}
        {[...pending].reverse().map((q, i) => (
          <Box key={`pending-${i}`} flexDirection="column">
            <Text color="suggestion">❯ {q}</Text>
            <Text>
              <Text color="claude">{spin}</Text>
              <Text color="inactive"> thinking…</Text>
            </Text>
          </Box>
        ))}

        {/* An empty group other than the current one is an ask still on its way. */}
        {[...list].filter((g) => g === current || g.turns.length).reverse().map((g) => (
          <Box key={g.id} flexDirection="column" gap={1}>
            {g !== current && g.turns.length > 0 && (
              <Text color="subtle">── "{cut(g.excerpt || "last reply", Math.max(8, width - 22))}" ── {g.turns.length}</Text>
            )}
            {[...g.turns].reverse().map(turnView)}
          </Box>
        ))}

        <Text color="inactive">shift+enter asks and keeps your place · ;x closes · wheel scrolls</Text>
      </Box>
    );
  });
};

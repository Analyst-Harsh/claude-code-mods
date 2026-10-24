import { expect, mock, test } from "claude-code/testing";
import type { On } from "claude-code";

const PANE = {
  plugin: "side-ask",
  component: "Pane",
  requestId: "side-ask",
  props: { title: "Side question", isFocused: false, bodyColumns: 60, placement: "dock", scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const;

const USAGE = { input_tokens: 10, output_tokens: 42, cache_read_input_tokens: 1200, cache_creation_input_tokens: 0 };
const REPLY = "Long reply. TCP starts each connection cautiously with slow start. More text.";
const SELECTED = "TCP starts each connection cautiously with slow start.";

// Enter at the prompt: only the person's own submits are asked on the side.
const composer = (text: string) => ({ text, origin: { kind: "composer" } }) as never;

// The engine beneath the plugin: one reply in the chat, a selection, a fork, and a model that counts prompts.
function engine(on: On, fork: (prompt: string) => unknown, selected = SELECTED) {
  const clock = mock.clock(on);
  const s = {
    clock, selected, prompts: [] as string[], opens: 0, closes: 0, draft: "x", forked: [] as string[],
    toasts: [] as string[], order: [] as string[], closedBy: [] as string[], placed: { isPlaced: true } as { isPlaced: boolean; reason?: string },
  };
  on("command.register", () => ({ value: { command: "side" } }) as never);
  on("ui.open", () => {
    s.opens++;
    s.order.push("open");
    return { value: s.placed } as never;
  });
  on("ui.toast", (_, e) => {
    s.toasts.push(e.text);
    return { value: undefined } as never;
  });
  on("ui.close", (_, e) => {
    s.closes++;
    s.closedBy.push(e.origin.kind);
    return { value: undefined } as never;
  });
  on("ui.selection", () => ({ value: s.selected ? { text: s.selected, requestId: "m1" } : undefined }) as never);
  on("session.messages", () => {
    s.order.push("messages");
    return { value: [{ role: "assistant", text: REPLY, toolUses: [] }] } as never;
  });
  on("prompt.read", () => ({ value: { text: s.draft, cursor: s.draft.length } }) as never);
  on("prompt.fill", (_, e) => {
    s.draft = e.text;
    return { isFilled: true } as never;
  });
  on("model.fork", (_, e) => {
    s.forked.push(e.prompt);
    return fork(e.prompt) as never;
  });
  on("prompt.submit", (_, e) => {
    s.prompts.push(e.text);
    return { text: e.text } as never;
  });
  on("session.start", (_, e) => ({ cwd: e.cwd }));
  return s;
}

const answer = (text: string) => () => ({ value: { isAnswered: true, text, usage: USAGE } });

// A placed open waits for the pane's first draw (or 200 ms): run the clock past it.
async function settle<T>(s: { clock: { advance: (ms: number) => Promise<unknown> } }, p: Promise<T>) {
  await s.clock.advance(250);
  return p;
}

test("`; question` never reaches the model; the answer about the selection shows in the pane", async ($, on) => {
  const s = engine(on, answer("Because the window must probe capacity."));
  await $.session.start({ cwd: "/", surface: "terminal", isInteractive: true });

  const r = await settle(s, $.prompt.submit(composer("; why slow start?")));
  expect((r as { drop?: string }).drop).toBe("asked on the side ↗");
  expect(s.prompts).toEqual([]); // dropped before the model
  expect(s.opens).toBe(1);

  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(s.forked[0]).toContain(REPLY); // the whole message the excerpt came from
  expect(s.forked[0]).toContain(SELECTED);
  expect(s.forked[0]).toContain("Question: why slow start?");
  expect(await ui.find({ text: /probe capacity/ })).toBeTruthy();
  expect(await ui.find({ text: /excerpt · 8 words/ })).toBeTruthy();
  await ui.unmount();
});

test("presets, close, and prompts that only look similar", async ($, on) => {
  const s = engine(on, answer("ok"));
  await $.session.start({ cwd: "/", surface: "terminal", isInteractive: true });

  await settle(s, $.prompt.submit(composer(";e")));
  expect(s.forked.at(-1)).toContain("Question: Show a minimal code example");
  await settle(s, $.prompt.submit(composer(";")));
  expect(s.forked.at(-1)).toContain("Question: Explain this simply");

  const closed = await $.prompt.submit(composer(";x"));
  expect((closed as { drop?: string }).drop).toBe("side pane closed");
  expect(s.closes).toBe(1);

  await $.prompt.submit(composer(";let x = 1")); // pasted code is a normal prompt
  await $.prompt.submit(composer("hello"));
  expect(s.prompts).toEqual([";let x = 1", "hello"]);
});

test("a fork that throws still keeps the question out of the chat", async ($, on) => {
  const s = engine(on, () => {
    throw new Error("boom");
  });
  await $.session.start({ cwd: "/", surface: "terminal", isInteractive: true });
  const r = await settle(s, $.prompt.submit(composer("; anything")));
  expect((r as { drop?: string }).drop).toBe("asked on the side ↗");
  expect(s.prompts).toEqual([]);
});

test("a newline after `; question` asks without submitting; other newlines are typed", async ($, on) => {
  const s = engine(on, answer("ok"));
  on("prompt.edit", (_, e) => ({ text: e.text + e.inputText, cursor: e.cursor + 1 }));
  await $.session.start({ cwd: "/", surface: "terminal", isInteractive: true });

  const edit = (text: string) =>
    $.prompt.edit({ origin: { kind: "person" }, text, cursor: text.length, start: text.length, end: text.length, inputText: "\n" } as never);
  expect(await settle(s, edit("; why slow start?\\"))).toEqual({ text: "", cursor: 0 });
  expect(s.opens).toBe(1); // opened before the edit hook returned
  expect(s.forked.at(-1)).toContain("Question: why slow start?\n".trim());
  expect(s.forked.at(-1)).not.toContain("start?\\");
  expect(s.prompts).toEqual([]);
  expect(await edit("hello")).toEqual({ text: "hello\n", cursor: 6 });
});

test("overlapping asks keep both answers, and a new draft is never wiped", async ($, on) => {
  let n = 0;
  const s = engine(on, () => ({ value: { isAnswered: true, text: `answer ${++n}`, usage: USAGE } }));
  await $.session.start({ cwd: "/", surface: "terminal", isInteractive: true });

  s.draft = "; first";
  await settle(s, $.prompt.submit(composer("; first")));
  s.draft = "; second";
  const second = $.prompt.submit(composer("; second"));
  await s.clock.advance(250);
  s.draft = "half-typed new message"; // typed within the clear delay
  await second;
  await s.clock.advance(100);
  expect(s.draft).toBe("half-typed new message");

  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await ui.find({ text: /second/ })).toBeTruthy();
  expect(await ui.find({ text: /first/ })).toBeTruthy();
  await ui.unmount();
});

// The kit has no transcript to scroll (`ui.scroll` hooks see panes and the band only): the scroll back is checked live.
test("the pane opens before the slow work reads the conversation", async ($, on) => {
  const s = engine(on, answer("ok"));
  await $.session.start({ cwd: "/", surface: "terminal", isInteractive: true });
  await settle(s, $.prompt.submit(composer("; why?")));
  expect(s.order).toEqual(["open", "messages"]);
});

test("a pane that cannot be placed says why, and the ask still runs", async ($, on) => {
  const s = engine(on, answer("ok"));
  s.placed = { isPlaced: false, reason: "unasked below 144 columns (120 now): placed when the person opens it" };
  await $.session.start({ cwd: "/", surface: "terminal", isInteractive: true });
  await $.prompt.submit(composer("; why?")); // unplaced: no wait for a draw
  expect(s.toasts).toEqual(["Side pane closed by hand: press Enter (not shift+enter) once to bring it back."]);
  expect(s.forked).toHaveLength(1);
});

test("overlapping asks keep the spinner until the last one lands", async ($, on) => {
  const waiting: ((v: unknown) => void)[] = [];
  const s = engine(on, () => new Promise((done) => waiting.push(done)));
  await $.session.start({ cwd: "/", surface: "terminal", isInteractive: true });
  await settle(s, $.prompt.submit(composer("; first")));
  await settle(s, $.prompt.submit(composer("; second")));
  waiting[0]!({ value: { isAnswered: true, text: "answer 1", usage: USAGE } });
  await s.clock.advance(10);

  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await ui.find({ text: /thinking/ })).toBeTruthy();
  expect(await ui.find({ text: /answer 1/ })).toBeTruthy();
  await ui.unmount();
});

test("an answer that lands after ;x does not bring the wiped history back", async ($, on) => {
  const waiting: ((v: unknown) => void)[] = [];
  const s = engine(on, () => new Promise((done) => waiting.push(done)));
  await $.session.start({ cwd: "/", surface: "terminal", isInteractive: true });
  await settle(s, $.prompt.submit(composer("; slow one")));
  await $.prompt.submit(composer(";x"));
  waiting[0]!({ value: { isAnswered: true, text: "late answer", usage: USAGE } });
  await s.clock.advance(10);

  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await ui.find({ text: /late answer/ })).toBeFalsy();
  expect(await ui.find({ text: /0 asks/ })).toBeTruthy();
  await ui.unmount();
});

test("fork failures read as plain words", async ($, on) => {
  const s = engine(on, () => ({ value: { isAnswered: false, reason: "api-error", status: 429, error: "rate_limit", usage: USAGE } }));
  await $.session.start({ cwd: "/", surface: "terminal", isInteractive: true });
  await settle(s, $.prompt.submit(composer("; why?")));
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await ui.find({ text: /Rate limited\. Try again/ })).toBeTruthy();
  await ui.unmount();
});

test("a draft that starts with ; shows the trigger hint, and clearing it hides the hint", async ($, on) => {
  engine(on, answer("ok"));
  on("prompt.edit", (_, e) => ({ text: e.text + e.inputText, cursor: e.cursor + 1 }));
  // Stands for the engine's own hint line: draws the tail it is handed.
  on("ui.render", { component: "PromptHint" }, ($, e) => {
    const { Text } = $.ui.resolve(e);
    return <Text>{e.props.tail ?? ""}</Text>;
  });
  await $.session.start({ cwd: "/", surface: "terminal", isInteractive: true });
  const hint = async () => {
    const ui = await $.ui.mount({
      plugin: "side-ask", component: "PromptHint", surface: "terminal",
      props: { isDraft: true, isWorking: false, hint: "? for shortcuts" },
    } as never);
    const tail = await ui.find({ text: /pitfalls/ });
    await ui.unmount();
    return !!tail;
  };
  const type = (text: string, inputText: string) =>
    $.prompt.edit({ origin: { kind: "person" }, text, cursor: text.length, start: text.length, end: text.length, inputText } as never);

  expect(await hint()).toBe(false);
  await type("", ";");
  expect(await hint()).toBe(true);
  await type("", "h"); // a fresh draft that does not start with ;
  expect(await hint()).toBe(false);
});


test("answers are asked to fit the pane's drawn width", async ($, on) => {
  const s = engine(on, answer("ok"));
  await $.session.start({ cwd: "/", surface: "terminal", isInteractive: true });
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" }); // drawn 60 columns wide
  await settle(s, $.prompt.submit(composer("; draw it")));
  expect(s.forked[0]).toContain("must fit in 56 characters"); // less the answer's bullet and margin
  expect(s.forked[0]).toContain("Tables and small diagrams are welcome when they fit");
  await ui.unmount();
});

test("a multi-line draft that starts with ; is typed and sent, never asked or wiped", async ($, on) => {
  const s = engine(on, answer("ok"));
  on("prompt.edit", (_, e) => ({ text: e.text + e.inputText, cursor: e.cursor + 1 }));
  await $.session.start({ cwd: "/", surface: "terminal", isInteractive: true });
  const text = "; a comment\nmov ax, 1";
  const r = await $.prompt.edit({ origin: { kind: "person" }, text, cursor: text.length, start: text.length, end: text.length, inputText: "\n" } as never);
  expect(r).toEqual({ text: `${text}\n`, cursor: text.length + 1 });
  await $.prompt.submit(composer(text));
  expect(s.prompts).toEqual([text]);
  expect(s.forked).toEqual([]);
});

test("a leading space still asks on the side; other senders' prompts pass through", async ($, on) => {
  const s = engine(on, answer("ok"));
  await $.session.start({ cwd: "/", surface: "terminal", isInteractive: true });
  const r = await settle(s, $.prompt.submit(composer(" ; why?")));
  expect((r as { drop?: string }).drop).toBe("asked on the side ↗");
  await $.prompt.submit({ text: "; scheduled", origin: { kind: "scheduled-trigger" } } as never);
  expect(s.prompts).toEqual(["; scheduled"]);
  expect(s.forked).toHaveLength(1);
});

test("an ask from before ;x does not stop the spinner of the same question asked again", async ($, on) => {
  const waiting: ((v: unknown) => void)[] = [];
  const s = engine(on, () => new Promise((done) => waiting.push(done)));
  await $.session.start({ cwd: "/", surface: "terminal", isInteractive: true });
  await settle(s, $.prompt.submit(composer(";")));
  await $.prompt.submit(composer(";x"));
  await settle(s, $.prompt.submit(composer(";")));
  waiting[0]!({ value: { isAnswered: true, text: "old answer", usage: USAGE } });
  await s.clock.advance(10);

  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await ui.find({ text: /thinking/ })).toBeTruthy();
  await ui.unmount();
});

test("the latest selection stays current when an earlier ask lands after it", async ($, on) => {
  const waiting: ((v: unknown) => void)[] = [];
  const s = engine(on, () => new Promise((done) => waiting.push(done)));
  await $.session.start({ cwd: "/", surface: "terminal", isInteractive: true });
  await settle(s, $.prompt.submit(composer("; first")));
  s.selected = "Another passage entirely.";
  await settle(s, $.prompt.submit(composer("; second")));
  waiting[0]!({ value: { isAnswered: true, text: "answer 1", usage: USAGE } });
  await s.clock.advance(10);
  s.selected = ""; // no selection: asks about the current excerpt
  await settle(s, $.prompt.submit(composer(";w")));
  expect(s.forked.at(-1)).toContain("Another passage entirely.");
});

test("one excerpt asked about past the cap keeps only its latest answers", async ($, on) => {
  const s = engine(on, answer("ok"));
  await $.session.start({ cwd: "/", surface: "terminal", isInteractive: true });
  for (let i = 0; i < 61; i++) {
    await settle(s, $.prompt.submit(composer(`; q${i}`)));
  }
  await s.clock.advance(10);
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await ui.find({ text: /60 asks/ })).toBeTruthy();
  await ui.unmount();
});

test("a failure reason this mod does not know still reads as words", async ($, on) => {
  const s = engine(on, () => ({ value: { isAnswered: false, reason: "weird", usage: USAGE } }));
  await $.session.start({ cwd: "/", surface: "terminal", isInteractive: true });
  await settle(s, $.prompt.submit(composer("; one")));
  await settle(s, $.prompt.submit(composer("; two"))); // the first is now drawn as an older turn
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await ui.find({ text: /No answer \(weird\)/ })).toBeTruthy();
  await ui.unmount();
});

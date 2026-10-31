import { atom, read, update } from "claude-code";
import type { EngineInterface, Register, TurnCompleteInput } from "claude-code";

const steps = atom({ plugin: "next-steps", key: "steps" } as const, []);
const isOpen = atom({ plugin: "next-steps", key: "isOpen" } as const, true);
const status = atom({ plugin: "next-steps", key: "status" } as const, "idle");

// Tokyo Night (Night)
const C = {
  fg: "#c0caf5",
  comment: "#565f89",
  line: "#3b4261",
  accent: "#7aa2f7", // status line: model, branch
  orange: "#ff9e64",
  green: "#9ece6a",
  cyan: "#7dcfff",
};

// Hotkeys are assigned at render: steps take 1..N, chips N+1, N+2, so digits never gap.
const CHIPS = [
  {
    key: "chip-yes",
    glyph: "✓",
    color: C.green,
    label: "yes, proceed",
    text: "yes, proceed",
  },
  {
    key: "chip-explain",
    glyph: "?",
    color: C.cyan,
    label: "explain why",
    text: "explain why, in detail",
  },
];

// The fork's prefix ends before the reply just finished, so the reply goes in the prompt.
const FORK_PROMPT = (answer: string) => `Your last reply to the user was:
"""
${answer}
"""
Return ONLY JSON {"steps": [...]}: 0-3 next actions the user would most likely ask for next, most likely first.
Each is a concrete imperative prompt they could send as-is, naming the real file, command or task.
Each is at most 6 words / 40 characters, no trailing punctuation.
If the reply asked the user a question, give the likely answers instead.
Use {"steps": []} if the reply needs no follow-up.`;

export const parseSteps = (text: string): string[] => {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) {
    return [];
  }

  try {
    const value = JSON.parse(json)?.steps;

    return Array.isArray(value)
      ? value
          .filter((s): s is string => typeof s === "string")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 3)
      : [];
  } catch {
    return [];
  }
};

const cut = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s;

// The turn whose fork may still write; a late fork of an older turn is dropped.
let pending = "";

async function suggest($: EngineInterface, e: TurnCompleteInput) {
  try {
    const r = await $.model.fork({ prompt: FORK_PROMPT(e.answer) });
    if (pending !== e.turnId) {
      return;
    }

    const list = r.isAnswered ? parseSteps(r.text) : [];
    await update($, steps, () => list);
    await update($, status, () => (list.length > 0 ? "ready" : "idle"));
  } catch {
    if (pending === e.turnId) {
      await update($, status, () => "idle");
    }
  }
}

export const register: Register = (on) => {
  on("prompt.submit", async ($, e, next) => {
    pending = "";
    await update($, status, () => "idle");
    await update($, steps, () => []);

    return next(e);
  });

  on("turn.complete", async ($, e, next) => {
    const r = await next(e);
    if (e.agentId || e.reason !== "answer" || !e.answer.trim()) {
      return r;
    }

    pending = e.turnId;
    await update($, steps, () => []);
    await update($, status, () => "loading");
    await update($, isOpen, () => true);
    void suggest($, e);

    return r;
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const state = await read($, status);
    const list = await read($, steps);
    const open = await read($, isOpen);
    if (
      e.props.hasSurvey ||
      e.props.isWorking ||
      state === "idle" ||
      (state === "ready" && list.length === 0)
    ) {
      return next(e);
    }

    const { Box, Button, Text } = $.ui.resolve(e);

    if (state === "loading") {
      return (
        <Box paddingX={1}>
          <Text color={C.comment}>▸ next steps  ⋯</Text>
        </Box>
      );
    }

    const fill = (text: string) => async () => {
      await $.prompt.fill({ text });
      await update($, status, () => "idle");
      await update($, steps, () => []);
    };

    // rail 2 + "N: " 3 + paddingX 2 + room for the engine's [-] at the right edge
    const width = Math.max(8, e.props.bodyColumns - 12);

    return (
      <Box flexDirection="column" paddingX={1}>
        <Button key="toggle" plain onPress={() => update($, isOpen, (v) => !v)}>
          <Text color={C.comment}>{open ? "▾ " : "▸ "}</Text>
          <Text color={C.accent} bold>
            next steps
          </Text>
          <Text color={C.line}>{"  "}</Text>
          <Text color={C.orange}>{String(list.length)}</Text>
        </Button>
        {open &&
          list.map((s, i) => (
            <Box key={`row-${i}`} flexDirection="row">
              <Text color={C.accent}>{"┃ "}</Text>
              <Button
                key={`step-${i}`}
                plain
                hotkey={String(i + 1)}
                onPress={fill(s)}
              >
                <Text color={C.fg}>{cut(s, width)}</Text>
              </Button>
            </Box>
          ))}
        {open && (
          <Box flexDirection="row">
            <Text color={C.line}>{"╰ "}</Text>
            <Box flexDirection="row" gap={3}>
              {CHIPS.map((c, i) => (
                <Button
                  key={c.key}
                  plain
                  hotkey={String(list.length + i + 1)}
                  onPress={fill(c.text)}
                >
                  <Text color={c.color}>{c.glyph} </Text>
                  <Text color={C.comment}>{c.label}</Text>
                </Button>
              ))}
            </Box>
          </Box>
        )}
      </Box>
    );
  });
};

import { ImageResponse } from "next/og";
import { siteConfig } from "@/config/site-config";

// Convert base64 string to ArrayBuffer compatible with Edge runtime (no Node Buffer)
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const length = binaryString.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes.buffer;
}

async function loadAssets(): Promise<
  { name: string; data: ArrayBuffer; weight: 400 | 600; style: "normal" }[]
> {
  const [{ base64Font: normal }, { base64Font: mono }, { base64Font: semibold }] =
    await Promise.all([
      import("./geist-regular-otf.json").then((mod) => mod.default || mod),
      import("./geistmono-regular-otf.json").then((mod) => mod.default || mod),
      import("./geist-semibold-otf.json").then((mod) => mod.default || mod),
    ]);

  return [
    {
      name: "Geist",
      data: base64ToArrayBuffer(normal),
      weight: 400 as const,
      style: "normal" as const,
    },
    {
      name: "Geist Mono",
      data: base64ToArrayBuffer(mono),
      weight: 400 as const,
      style: "normal" as const,
    },
    {
      name: "Geist",
      data: base64ToArrayBuffer(semibold),
      weight: 600 as const,
      style: "normal" as const,
    },
  ];
}

/** Card geometry. The content block sits between the top rule and the footer band. */
const COLUMN_WIDTH = 896;
const CONTENT_HEIGHT = 310;
const TITLE_LINE_HEIGHT = 1.1;
const TITLE_GAP = 24;
const MAX_TITLE_LINES = 2;
const DESCRIPTION_FONT_SIZE = 32;
const DESCRIPTION_LINE_HEIGHT = 1.4;
const MAX_DESCRIPTION_LINES = 4;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title") ?? siteConfig.title;
  const description = searchParams.get("description") ?? siteConfig.description;
  const url = searchParams.get("url") ?? siteConfig?.url.replace(/https?:\/\//, "");
  const theme = searchParams.get("theme") === "light" ? "light" : "dark";

  // The card is a fixed 1200x630 and the copy is not, so the two text blocks
  // share a height budget rather than being allowed to grow into each other or
  // into the footer band. Satori cannot measure text, so line counts are
  // estimated from length at the known font size and column width, then both
  // blocks are clamped to what the budget allows.
  const titleFontSize = title && title.length > 20 ? 64 : 80;
  const titleLines = Math.min(
    MAX_TITLE_LINES,
    Math.max(1, Math.ceil((title?.length ?? 0) / Math.floor(COLUMN_WIDTH / (titleFontSize * 0.5))))
  );
  const titleHeight = titleLines * titleFontSize * TITLE_LINE_HEIGHT;
  const descriptionLines = Math.min(
    MAX_DESCRIPTION_LINES,
    Math.max(
      1,
      Math.floor(
        (CONTENT_HEIGHT - titleHeight - TITLE_GAP) /
          (DESCRIPTION_FONT_SIZE * DESCRIPTION_LINE_HEIGHT)
      )
    )
  );

  const isDark = theme === "dark";
  const colors = {
    bg: isDark ? "#000000" : "#ffffff",
    fg: isDark ? "#ffffff" : "#000000",
    border: isDark ? "#44403c" : "#d6d3d1",
    muted: isDark ? "#78716c" : "#57534e",
    body: isDark ? "#a8a29e" : "#57534e",
  };

  const [fonts] = await Promise.all([loadAssets()]);

  return new ImageResponse(
    <div
      // eslint-disable-next-line react/no-unknown-property
      tw="flex h-full w-full"
      style={{ fontFamily: "Geist Sans", backgroundColor: colors.bg, color: colors.fg }}
    >
      <div
        // eslint-disable-next-line react/no-unknown-property
        tw="flex absolute inset-y-0 left-16 w-px"
        style={{ borderLeft: `1px dashed ${colors.border}` }}
      />
      <div
        // eslint-disable-next-line react/no-unknown-property
        tw="flex absolute inset-y-0 right-16 w-px"
        style={{ borderLeft: `1px dashed ${colors.border}` }}
      />
      <div
        // eslint-disable-next-line react/no-unknown-property
        tw="flex absolute inset-x-0 h-px top-16"
        style={{ borderTop: `1px solid ${colors.border}` }}
      />
      <div
        // eslint-disable-next-line react/no-unknown-property
        tw="flex absolute inset-x-0 h-px bottom-16"
        style={{ borderTop: `1px solid ${colors.border}` }}
      />
      {/* Footer band. The content block above stops short of this row so a long
          description can never run into the URL or the mark. */}
      {/* eslint-disable-next-line react/no-unknown-property */}
      <div tw="flex absolute bottom-24 left-24 right-24 items-center justify-between">
        <div
          // eslint-disable-next-line react/no-unknown-property
          tw="flex text-[32px]"
          style={{ fontWeight: 400, color: colors.muted }}
        >
          {url}
        </div>
        {/* The brand mark, inlined. Satori is an <img> boundary, so the tile is
            drawn here with an explicit fill and the ampersand is knocked out of
            it with evenodd, letting the card ground show through. */}
        <svg width={80} height={80} viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
          <path
            fill={colors.fg}
            fillRule="evenodd"
            d="M0 64A64 64 0 0 1 64 0H448A64 64 0 0 1 512 64V448A64 64 0 0 1 448 512H64A64 64 0 0 1 0 448ZM224.2 402.4C259.4 402.4 288.2 394.4 305 382L316.6 396H377L340.2 352.4C357.4 332.8 369 302 370.6 271.2L318.6 266.4C318.6 287.2 314.6 304 307 314.4L255.4 250C297.4 224.4 316.2 203.6 316.2 171.2C316.2 132.8 288.6 105.6 236.6 105.6C185 105.6 156.2 132.8 156.2 175.6C156.2 200.8 166.6 218.4 185 239.6C142.6 267.2 127 290 127 326C127 375.2 161.8 402.4 224.2 402.4ZM229 356.8C196.6 356.8 181 343.2 181 321.6C181 302 190.2 288 213 272.8L271 344.8C263.4 352 249.4 356.8 229 356.8ZM229 218.4C214.2 201.2 209.4 190.4 209.4 177.2C209.4 161.2 219.4 150.8 237 150.8C253.4 150.8 262.6 160 262.6 175.6C262.6 192.4 253 203.6 229 218.4Z"
          />
        </svg>
      </div>
      {/* eslint-disable-next-line react/no-unknown-property */}
      <div
        // eslint-disable-next-line react/no-unknown-property
        tw="flex flex-col absolute justify-center left-32 top-28"
        style={{ width: COLUMN_WIDTH, height: CONTENT_HEIGHT, overflow: "hidden" }}
      >
        <div
          // eslint-disable-next-line react/no-unknown-property
          tw="tracking-tight flex"
          style={{
            fontWeight: 600,
            fontSize: titleFontSize,
            lineHeight: TITLE_LINE_HEIGHT,
            letterSpacing: "-0.04em",
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: MAX_TITLE_LINES,
            overflow: "hidden",
            textOverflow: "ellipsis",
            flexShrink: 0,
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: TITLE_GAP,
            fontWeight: 500,
            fontSize: DESCRIPTION_FONT_SIZE,
            lineHeight: DESCRIPTION_LINE_HEIGHT,
            color: colors.body,
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: descriptionLines,
            overflow: "hidden",
            textOverflow: "ellipsis",
            flexShrink: 0,
          }}
        >
          {description}
        </div>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
      fonts,
    }
  );
}

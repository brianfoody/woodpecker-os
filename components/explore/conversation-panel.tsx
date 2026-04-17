"use client";

import { useEffect, useRef } from "react";
import type { ThemeConfig, ThemeTokens } from "./themes/types";
import {
  conversationData,
  type ConversationMessage,
} from "./conversation-data";

interface ConversationPanelProps {
  theme: ThemeConfig;
  isDark: boolean;
}

export function ConversationPanel({ theme, isDark }: ConversationPanelProps) {
  const fontLinkRef = useRef<HTMLLinkElement | null>(null);
  const tokens = isDark ? theme.dark : theme.light;

  // Load Google Fonts dynamically
  useEffect(() => {
    const existing = document.querySelector(
      `link[href="${theme.googleFontsUrl}"]`
    );
    if (!existing) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = theme.googleFontsUrl;
      document.head.appendChild(link);
      fontLinkRef.current = link;
    }

    // Load Caveat for echo-style handwriting
    if (theme.userMessageStyle === "echo") {
      const caveatUrl =
        "https://fonts.googleapis.com/css2?family=Caveat:wght@400;500&display=swap";
      if (!document.querySelector(`link[href="${caveatUrl}"]`)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = caveatUrl;
        document.head.appendChild(link);
      }
    }

    return () => {
      // Don't remove — other themes may share the same font URL
    };
  }, [theme.googleFontsUrl, theme.userMessageStyle]);

  if (theme.layout === "card") {
    return (
      <CardLayout theme={theme} tokens={tokens} />
    );
  }

  if (theme.layout === "wide-margin") {
    return (
      <WideMarginLayout theme={theme} tokens={tokens} />
    );
  }

  return (
    <ThreadLayout theme={theme} tokens={tokens} />
  );
}

// ─── Card Layout (04e family) ───────────────────────────────────────────────

function CardLayout({
  theme,
  tokens,
}: {
  theme: ThemeConfig;
  tokens: ThemeTokens;
}) {
  return (
    <div
      style={{
        maxWidth: theme.maxWidth ?? 600,
        width: theme.maxWidth ?? 600,
        padding: "40px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {conversationData.map((section, si) => (
        <div key={si}>
          {si > 0 && (
            <div
              style={{
                height: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "4px 0",
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 1,
                  background: tokens.connectorFrom,
                  borderRadius: 1,
                }}
              />
            </div>
          )}
          {section.messages.map((msg, mi) => {
            const isEcho =
              theme.userMessageStyle === "echo" && msg.role === "user";
            const nextIsEcho =
              mi < section.messages.length - 1 &&
              theme.userMessageStyle === "echo" &&
              section.messages[mi + 1].role === "user";
            const showConnector =
              mi < section.messages.length - 1 && !isEcho && !nextIsEcho;

            return (
              <div key={`${si}-${mi}`}>
                {isEcho ? (
                  <EchoMessage theme={theme} tokens={tokens} message={msg} />
                ) : (
                  <CardMessage theme={theme} tokens={tokens} message={msg} />
                )}
                {isEcho && (
                  <div style={{ display: "flex", justifyContent: "center", height: 22 }}>
                    <div style={{ width: 1, height: "100%", background: `linear-gradient(${tokens.accentUser}40, ${tokens.accentAi}40)` }} />
                  </div>
                )}
                {showConnector && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      height: theme.connectorHeight ?? 20,
                    }}
                  >
                    <div
                      style={{
                        width: theme.connectorWidth ?? 2,
                        height: "100%",
                        background: `linear-gradient(${tokens.connectorFrom}, ${tokens.connectorTo})`,
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function CardMessage({
  theme,
  tokens,
  message,
}: {
  theme: ThemeConfig;
  tokens: ThemeTokens;
  message: ConversationMessage;
}) {
  const isUser = message.role === "user";
  const bg = isUser ? tokens.cardUserBg : tokens.cardAiBg;
  const border = isUser ? tokens.cardUserBorder : tokens.cardAiBorder;
  const accent = isUser ? tokens.accentUser : tokens.accentAi;
  const labelColor = isUser
    ? tokens.labelUser ?? accent
    : tokens.labelAi ?? accent;

  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderLeft: `${theme.accentBorderWidth ?? 4}px solid ${accent}`,
        borderRadius: theme.cardRadius ?? 16,
        padding: "20px 24px",
        boxShadow: tokens.shadow,
        fontFamily: theme.fonts.primary,
        fontSize: 15,
        lineHeight: theme.lineHeight ?? 1.65,
        color: tokens.textPrimary,
        fontWeight: theme.bodyFontWeight ?? 400,
      }}
    >
      <div
        style={{
          fontFamily: theme.fonts.label ?? theme.fonts.primary,
          fontSize: theme.labelFontSize ?? 11,
          fontWeight: theme.labelFontWeight ?? 600,
          letterSpacing: theme.labelLetterSpacing ?? "0.08em",
          textTransform: theme.labelUppercase !== false ? "uppercase" : "none",
          color: labelColor,
          marginBottom: 8,
        }}
      >
        {isUser ? "You" : "Woodpecker"}
      </div>
      <div
        dangerouslySetInnerHTML={{ __html: message.content }}
        style={{
          color: tokens.textSecondary,
        }}
        className="explore-card-content"
      />
      {message.list && (
        <ul
          style={{
            margin: "10px 0 0 0",
            paddingLeft: 20,
            color: tokens.textSecondary,
          }}
        >
          {message.list.map((item, i) => (
            <li
              key={i}
              dangerouslySetInnerHTML={{ __html: item }}
              style={{ marginBottom: 4 }}
            />
          ))}
        </ul>
      )}
      {message.codeBlock && (
        <pre
          style={{
            background: tokens.codeBlockBg,
            color: tokens.codeBlockColor,
            borderRadius: 10,
            padding: "14px 16px",
            fontSize: 13,
            lineHeight: 1.55,
            fontFamily: theme.fonts.mono,
            margin: "12px 0 0 0",
            overflowX: "auto",
            whiteSpace: "pre",
          }}
        >
          {message.codeBlock}
        </pre>
      )}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .explore-card-content code {
          background: ${tokens.codeBg};
          color: ${tokens.codeColor};
          font-family: ${theme.fonts.mono};
          font-size: 13px;
          border-radius: 5px;
          padding: 2px 6px;
        }
      `,
        }}
      />
    </div>
  );
}

// ─── Echo Message (subtle user label for handwriting-visible themes) ─────────

function EchoMessage({
  theme,
  tokens,
  message,
}: {
  theme: ThemeConfig;
  tokens: ThemeTokens;
  message: ConversationMessage;
}) {
  const labelColor = tokens.labelUser ?? tokens.accentUser;

  return (
    <div
      style={{
        background: `${tokens.accentUser}08`,
        borderRadius: theme.cardRadius ?? 16,
        padding: "12px 16px",
        fontFamily: theme.fonts.primary,
      }}
    >
      <div
        style={{
          fontSize: theme.labelFontSize ?? 11,
          fontWeight: theme.labelFontWeight ?? 600,
          letterSpacing: theme.labelLetterSpacing ?? "0.08em",
          textTransform: theme.labelUppercase !== false ? "uppercase" : "none",
          color: labelColor,
          opacity: 0.6,
          marginBottom: 4,
        }}
      >
        You
      </div>
      <div
        style={{
          fontFamily: "'Caveat', cursive",
          fontSize: 19,
          color: tokens.textPrimary,
          lineHeight: 1.4,
        }}
        dangerouslySetInnerHTML={{ __html: message.content }}
      />
    </div>
  );
}

// ─── Thread Layout (06 v1-v4) ───────────────────────────────────────────────

function ThreadLayout({
  theme,
  tokens,
}: {
  theme: ThemeConfig;
  tokens: ThemeTokens;
}) {
  const isColorThread = theme.id === "thread-color";

  return (
    <div
      style={{
        maxWidth: theme.maxWidth ?? 560,
        width: theme.maxWidth ?? 560,
        padding: "60px 20px",
        paddingLeft: (theme.threadPaddingLeft ?? 28) + 20,
        position: "relative",
      }}
    >
      {/* Global thread line (not used for color-thread) */}
      {!isColorThread && (
        <div
          style={{
            position: "absolute",
            left: 20,
            top: 0,
            bottom: 0,
            width: theme.threadWidth ?? 1,
            background: tokens.threadColor,
          }}
        />
      )}

      {conversationData.map((section, si) => (
        <div key={si}>
          {si > 0 && (
            <div
              style={{
                margin: `${isColorThread ? 40 : 52}px 0`,
                display: "flex",
                alignItems: "center",
                ...(isColorThread
                  ? {
                      marginLeft: -(theme.threadPaddingLeft ?? 28),
                      paddingLeft: theme.threadPaddingLeft ?? 28,
                      borderLeft: `1px solid ${tokens.sectionMark}`,
                    }
                  : {}),
              }}
            >
              <div
                style={{
                  position: "relative",
                  left: -(theme.threadPaddingLeft ?? 28) - (isColorThread ? 0 : (theme.threadWidth ?? 1) / 2),
                  width: isColorThread ? 7 : (theme.dotSize ?? 5),
                  height: isColorThread ? 1 : (theme.threadWidth ?? 0.5),
                  background: tokens.sectionMark,
                }}
              />
            </div>
          )}
          {section.messages.map((msg, mi) => (
            <ThreadMessage
              key={`${si}-${mi}`}
              theme={theme}
              tokens={tokens}
              message={msg}
              isColorThread={isColorThread}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function ThreadMessage({
  theme,
  tokens,
  message,
  isColorThread,
}: {
  theme: ThemeConfig;
  tokens: ThemeTokens;
  message: ConversationMessage;
  isColorThread: boolean;
}) {
  const isUser = message.role === "user";
  const dotColor = isUser ? tokens.dotUser : tokens.dotAi;
  const dotSize = theme.dotSize ?? 5;
  const paddingLeft = theme.threadPaddingLeft ?? 28;

  const labelColor = isUser
    ? tokens.labelUser ?? tokens.labelColor ?? "#aaa"
    : tokens.labelAi ?? tokens.labelColor ?? "#aaa";

  const fontWeight = isUser
    ? theme.userFontWeight ?? 400
    : theme.aiFontWeight ?? 300;

  const colorThreadStyle = isColorThread
    ? {
        marginLeft: -paddingLeft,
        paddingLeft: paddingLeft,
        borderLeft: `1px solid ${isUser ? tokens.threadUser : tokens.threadAi}`,
      }
    : {};

  return (
    <div
      style={{
        marginBottom: theme.messageSpacing ?? 40,
        position: "relative",
        fontFamily: theme.fonts.primary,
        fontSize: 15,
        lineHeight: theme.lineHeight ?? 1.7,
        color: tokens.textPrimary,
        fontWeight,
        ...colorThreadStyle,
      }}
    >
      {/* Dot marker */}
      <div
        style={{
          position: "absolute",
          left: isColorThread ? -4 : -(paddingLeft + (theme.threadWidth ?? 1) / 2) + (dotSize / -2) + (theme.threadWidth ?? 1) / 2,
          top: 6,
          width: dotSize,
          height: dotSize,
          borderRadius: "50%",
          background: dotColor,
        }}
      />

      {/* Label */}
      <div
        style={{
          fontFamily: theme.fonts.label ?? theme.fonts.primary,
          fontSize: theme.labelFontSize ?? 10,
          fontWeight: theme.labelFontWeight ?? 500,
          letterSpacing: theme.labelLetterSpacing ?? "0.1em",
          textTransform: theme.labelUppercase !== false ? "uppercase" : "none",
          color: labelColor,
          marginBottom: 4,
        }}
      >
        {isUser ? "You" : "Woodpecker"}
      </div>

      {/* Content */}
      <div
        dangerouslySetInnerHTML={{ __html: message.content }}
        style={{ color: tokens.textSecondary }}
        className="explore-thread-content"
      />
      {message.list && (
        <ul
          style={{
            margin: "8px 0 0 0",
            paddingLeft: 20,
            color: tokens.textSecondary,
            fontWeight: theme.aiFontWeight ?? 300,
          }}
        >
          {message.list.map((item, i) => (
            <li
              key={i}
              dangerouslySetInnerHTML={{ __html: item }}
              style={{ marginBottom: 3 }}
            />
          ))}
        </ul>
      )}
      {message.codeBlock && (
        <pre
          style={{
            background: tokens.codeBlockBg,
            color: tokens.codeBlockColor,
            borderRadius: 4,
            padding: "12px 16px",
            fontSize: 13,
            lineHeight: 1.55,
            fontFamily: theme.fonts.mono,
            margin: "10px 0 0 0",
            overflowX: "auto",
            whiteSpace: "pre",
          }}
        >
          {message.codeBlock}
        </pre>
      )}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .explore-thread-content code {
          background: ${tokens.codeBg};
          color: ${tokens.codeColor};
          font-family: ${theme.fonts.mono};
          font-size: 13.5px;
          border-radius: 3px;
          padding: 1px 5px;
        }
      `,
        }}
      />
    </div>
  );
}

// ─── Wide Margin Layout (06 v5) ─────────────────────────────────────────────

function WideMarginLayout({
  theme,
  tokens,
}: {
  theme: ThemeConfig;
  tokens: ThemeTokens;
}) {
  return (
    <div
      style={{
        maxWidth: theme.maxWidth ?? 680,
        width: theme.maxWidth ?? 680,
        padding: "60px 20px",
        display: "grid",
        gridTemplateColumns: "100px 1px 1fr",
        gap: "0 20px",
        position: "relative",
      }}
    >
      {/* Thread line in column 2 */}
      <div
        style={{
          gridColumn: "2",
          gridRow: "1 / -1",
          background: tokens.threadColor,
          width: 1,
        }}
      />

      {conversationData.map((section, si) => (
        <div key={si} style={{ display: "contents" }}>
          {si > 0 && (
            <>
              {/* Section break spanning all 3 columns */}
              <div
                style={{
                  gridColumn: "1",
                  height: 40,
                }}
              />
              <div
                style={{
                  gridColumn: "2",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    width: 7,
                    height: 1,
                    background: tokens.sectionMark,
                  }}
                />
              </div>
              <div style={{ gridColumn: "3", height: 40 }} />
            </>
          )}
          {section.messages.map((msg, mi) => (
            <WideMarginMessage
              key={`${si}-${mi}`}
              theme={theme}
              tokens={tokens}
              message={msg}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function WideMarginMessage({
  theme,
  tokens,
  message,
}: {
  theme: ThemeConfig;
  tokens: ThemeTokens;
  message: ConversationMessage;
}) {
  const isUser = message.role === "user";
  const dotColor = isUser ? tokens.dotUser : tokens.dotAi;
  const labelColor = tokens.marginLabel ?? tokens.labelColor ?? "#999";
  const fontWeight = isUser
    ? theme.userFontWeight ?? 400
    : theme.aiFontWeight ?? 300;

  return (
    <>
      {/* Column 1: margin label */}
      <div
        style={{
          gridColumn: "1",
          textAlign: "right",
          fontFamily: theme.fonts.label ?? theme.fonts.primary,
          fontSize: theme.labelFontSize ?? 11,
          fontWeight: theme.labelFontWeight ?? 500,
          letterSpacing: theme.labelLetterSpacing ?? "0.08em",
          textTransform: theme.labelUppercase !== false ? "uppercase" : "none",
          color: labelColor,
          paddingTop: 2,
        }}
      >
        {isUser ? "You" : "Woodpecker"}
      </div>

      {/* Column 2: dot */}
      <div
        style={{
          gridColumn: "2",
          display: "flex",
          justifyContent: "center",
          paddingTop: 6,
        }}
      >
        <div
          style={{
            width: theme.dotSize ?? 7,
            height: theme.dotSize ?? 7,
            borderRadius: "50%",
            background: dotColor,
          }}
        />
      </div>

      {/* Column 3: content */}
      <div
        style={{
          gridColumn: "3",
          paddingBottom: theme.messageSpacing ?? 32,
          fontFamily: theme.fonts.primary,
          fontSize: 15,
          lineHeight: theme.lineHeight ?? 1.7,
          color: tokens.textPrimary,
          fontWeight,
        }}
      >
        <div
          dangerouslySetInnerHTML={{ __html: message.content }}
          style={{ color: tokens.textSecondary }}
          className="explore-wide-content"
        />
        {message.list && (
          <ul
            style={{
              margin: "8px 0 0 0",
              paddingLeft: 20,
              color: tokens.textSecondary,
              fontWeight: theme.aiFontWeight ?? 300,
            }}
          >
            {message.list.map((item, i) => (
              <li
                key={i}
                dangerouslySetInnerHTML={{ __html: item }}
                style={{ marginBottom: 3 }}
              />
            ))}
          </ul>
        )}
        {message.codeBlock && (
          <pre
            style={{
              background: tokens.codeBlockBg,
              color: tokens.codeBlockColor,
              borderRadius: 4,
              padding: "12px 16px",
              fontSize: 13,
              lineHeight: 1.55,
              fontFamily: theme.fonts.mono,
              margin: "10px 0 0 0",
              overflowX: "auto",
              whiteSpace: "pre",
            }}
          >
            {message.codeBlock}
          </pre>
        )}
        <style
          dangerouslySetInnerHTML={{
            __html: `
          .explore-wide-content code {
            background: ${tokens.codeBg};
            color: ${tokens.codeColor};
            font-family: ${theme.fonts.mono};
            font-size: 13.5px;
            border-radius: 3px;
            padding: 1px 5px;
          }
        `,
          }}
        />
      </div>
    </>
  );
}

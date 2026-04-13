#!/usr/bin/env node
/**
 * ZCyberNews Telegram ↔ Claude Code Bot
 *
 * Uses the Claude Code CLI (`claude -p`) so it runs on your existing
 * subscription — no API key needed.
 *
 * Features:
 *   - Pre-approved tools so Claude can read files, search, run commands
 *   - Approve/Deny inline buttons for dangerous operations
 *   - Slash commands for common server tasks
 *
 * Env vars (from .env.local):
 *   TELEGRAM_BOT_TOKEN  — your bot token from @BotFather
 *   TELEGRAM_CHAT_ID    — your personal chat ID (only you can use the bot)
 *
 * Run:  node scripts/telegram/bot.mjs
 * PM2:  pm2 start scripts/telegram/bot.mjs --name tg-claude
 */

import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Load .env.local ────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const envPath = resolve(ROOT, ".env.local");

try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  console.error("⚠️  Could not read .env.local — make sure it exists");
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_CHAT = process.env.TELEGRAM_CHAT_ID;

if (!BOT_TOKEN || !ALLOWED_CHAT) {
  console.error("❌ TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID must be set");
  process.exit(1);
}

const API = `https://api.telegram.org/bot${BOT_TOKEN}`;
let offset = 0;

// ── Pending confirmations (keyed by callback data ID) ─────────────────────
const pendingActions = new Map();
let actionCounter = 0;

// ── Telegram helpers ───────────────────────────────────────────────────────
async function tgCall(method, body) {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function sendMessage(chatId, text, options = {}) {
  // Telegram has a 4096 char limit per message
  const chunks = [];
  for (let i = 0; i < text.length; i += 4000) {
    chunks.push(text.slice(i, i + 4000));
  }
  let lastResult = null;
  for (let i = 0; i < chunks.length; i++) {
    const body = {
      chat_id: chatId,
      text: chunks[i],
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    };
    // Only add reply_markup to the last chunk
    if (i === chunks.length - 1 && options.reply_markup) {
      body.reply_markup = options.reply_markup;
    }
    lastResult = await tgCall("sendMessage", body).catch(() =>
      // Fallback without markdown if it fails
      tgCall("sendMessage", {
        ...body,
        parse_mode: undefined,
      })
    );
  }
  return lastResult;
}

async function editMessage(chatId, messageId, text, replyMarkup) {
  const body = {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "Markdown",
    disable_web_page_preview: true,
  };
  if (replyMarkup) body.reply_markup = replyMarkup;
  return tgCall("editMessageText", body).catch(() =>
    tgCall("editMessageText", { ...body, parse_mode: undefined })
  );
}

async function answerCallback(callbackQueryId, text) {
  return tgCall("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  });
}

async function sendTyping(chatId) {
  await tgCall("sendChatAction", { chat_id: chatId, action: "typing" });
}

// ── Confirmation flow (approve/deny buttons) ──────────────────────────────
async function askConfirmation(chatId, description, onApprove) {
  const id = String(++actionCounter);
  pendingActions.set(id, { onApprove, description, createdAt: Date.now() });

  // Auto-expire after 5 minutes
  setTimeout(() => pendingActions.delete(id), 5 * 60 * 1000);

  await sendMessage(chatId, `⚠️ *Confirmation Required*\n\n${description}`, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Approve", callback_data: `approve:${id}` },
          { text: "❌ Deny", callback_data: `deny:${id}` },
        ],
      ],
    },
  });
}

// ── Claude Code CLI ────────────────────────────────────────────────────────
function askClaude(prompt) {
  return new Promise((resolve) => {
    const child = execFile(
      "claude",
      [
        "-p", prompt,
        "--allowedTools",
        "Bash", "Read", "Glob", "Grep",
      ],
      {
        cwd: ROOT,
        timeout: 120_000, // 2 min max
        maxBuffer: 1024 * 1024,
        env: { ...process.env, HOME: process.env.HOME || "/root" },
      },
      (err, stdout, stderr) => {
        if (err) {
          resolve(`❌ Error: ${err.message}`.trim());
        } else {
          resolve(stdout.trim() || "(empty response)");
        }
      }
    );

    // Prevent stdin warning — close stdin immediately
    child.stdin?.end();
  });
}

// ── Quick shell command (no Claude, instant) ──────────────────────────────
function shell(cmd, timeoutMs = 15_000) {
  return new Promise((resolve) => {
    execFile("bash", ["-c", cmd], { cwd: ROOT, timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) resolve(`❌ ${stderr || err.message}`.trim());
      else resolve(stdout.trim() || "(no output)");
    });
  });
}

// ── Command registry ───────────────────────────────────────────────────────
const COMMANDS = {
  "/start": {
    desc: "Show all commands",
    handler: async (chatId) => {
      const lines = [
        "🤖 *ZCyberNews Claude Bot*\n",
        "📊 *Server & Monitoring*",
        "/status — Server health (memory, uptime, PM2)",
        "/mem — Quick memory check",
        "/disk — Disk usage",
        "/top — Top 5 processes by memory",
        "/uptime — Server uptime & load average\n",
        "📰 *Content & Pipeline*",
        "/articles — 10 most recent published articles",
        "/count — Total article count (EN + ZH)",
        "/logs — Last pipeline run log",
        "/pipeline — Run the pipeline now (⚠️ requires approval)",
        "/sources — List active RSS sources\n",
        "🔧 *Site Management*",
        "/restart — Restart the website (⚠️ requires approval)",
        "/build — Rebuild & restart site (⚠️ requires approval)",
        "/pull — Git pull latest (⚠️ requires approval)",
        "/gitlog — Last 10 git commits",
        "/errors — Recent Next.js error logs\n",
        "💬 *Chat*",
        "Just type anything to chat with Claude",
        "Claude can read files, search code, and run commands\n",
        "🔐 Dangerous actions require your approval via buttons",
      ];
      await sendMessage(chatId, lines.join("\n"));
    },
  },

  // ── Server & Monitoring (safe — no confirmation needed) ─────────────────
  "/status": {
    desc: "Server health overview",
    handler: async (chatId) => {
      await sendTyping(chatId);
      const [pm2, mem, swap, load] = await Promise.all([
        shell("pm2 jlist 2>/dev/null | node -e \"const d=JSON.parse(require('fs').readFileSync(0,'utf8'));d.forEach(p=>console.log(p.pm2_env.status==='online'?'✅':'❌',p.name,'-',Math.round(p.monit.memory/1024/1024)+'MB','-',p.pm2_env.restart_time+'↻'))\" 2>/dev/null || pm2 list --no-color 2>/dev/null"),
        shell("free -h | awk '/Mem:/{print $3\"/\"$2\" used (\"$7\" avail)\"}' 2>/dev/null"),
        shell("free -h | awk '/Swap:/{print $3\"/\"$2\" used\"}' 2>/dev/null"),
        shell("uptime -p 2>/dev/null"),
      ]);
      const msg = `📊 *Server Status*\n\n*Processes:*\n${pm2}\n\n*Memory:* ${mem}\n*Swap:* ${swap}\n*Uptime:* ${load}`;
      await sendMessage(chatId, msg);
    },
  },

  "/mem": {
    desc: "Quick memory check",
    handler: async (chatId) => {
      const out = await shell("free -h");
      await sendMessage(chatId, `\`\`\`\n${out}\n\`\`\``);
    },
  },

  "/disk": {
    desc: "Disk usage",
    handler: async (chatId) => {
      const out = await shell("df -h / | tail -1 | awk '{print \"Used: \"$3\"/\"$2\" (\"$5\")  Free: \"$4}'");
      await sendMessage(chatId, `💾 *Disk:* ${out}`);
    },
  },

  "/top": {
    desc: "Top 5 processes by memory",
    handler: async (chatId) => {
      const out = await shell("ps aux --sort=-%mem | head -6 | awk '{printf \"%-6s %s %s\\n\", $4\"%\", $11, $12}' | head -6");
      await sendMessage(chatId, `🔝 *Top processes (by RAM):*\n\`\`\`\n${out}\n\`\`\``);
    },
  },

  "/uptime": {
    desc: "Server uptime & load",
    handler: async (chatId) => {
      const out = await shell("uptime");
      await sendMessage(chatId, `⏱ ${out}`);
    },
  },

  // ── Content & Pipeline ───────────────────────────────────────────────────
  "/articles": {
    desc: "10 most recent articles",
    handler: async (chatId) => {
      await sendTyping(chatId);
      const out = await shell(
        "ls -1t content/en/posts/*.mdx content/en/threat-intel/*.mdx 2>/dev/null | head -10 | while read f; do " +
        "title=$(grep \"^title:\" \"$f\" | head -1 | sed \"s/^title: *//;s/^[\\\"']*//;s/[\\\"']*$//\"); " +
        "date=$(grep \"^date:\" \"$f\" | head -1 | sed \"s/^date: *//;s/[\\\"' ]//g\"); " +
        "echo \"📄 $date — $title\"; done"
      );
      await sendMessage(chatId, `📰 *Recent Articles:*\n\n${out || "No articles found"}`);
    },
  },

  "/count": {
    desc: "Total article count",
    handler: async (chatId) => {
      const [en, zh, ti] = await Promise.all([
        shell("ls content/en/posts/*.mdx 2>/dev/null | wc -l"),
        shell("ls content/zh/posts/*.mdx 2>/dev/null | wc -l"),
        shell("ls content/en/threat-intel/*.mdx 2>/dev/null | wc -l"),
      ]);
      await sendMessage(chatId, `📊 *Article Count:*\n\n🇬🇧 EN posts: ${en.trim()}\n🇨🇳 ZH posts: ${zh.trim()}\n🛡 Threat Intel: ${ti.trim()}\n📦 Total: ${Number(en)+Number(zh)+Number(ti)}`);
    },
  },

  "/logs": {
    desc: "Last pipeline log",
    handler: async (chatId) => {
      await sendTyping(chatId);
      const out = await shell("ls -1t .pipeline-logs/*.log 2>/dev/null | head -1 | xargs tail -30 2>/dev/null || echo 'No logs found'");
      await sendMessage(chatId, `📋 *Last Pipeline Log:*\n\`\`\`\n${out}\n\`\`\``);
    },
  },

  "/pipeline": {
    desc: "Manually trigger pipeline now",
    requiresApproval: true,
    handler: async (chatId) => {
      await askConfirmation(
        chatId,
        "🚀 *Run AI content pipeline*\nThis will generate up to 5 articles and takes 1-2 minutes.",
        async () => {
          await sendMessage(chatId, "🚀 Pipeline started... Please wait.");
          await sendTyping(chatId);
          const reply = await shell("bash scripts/run-pipeline.sh --max-articles=5 2>&1 | tail -20", 300_000);
          await sendMessage(chatId, `📋 *Pipeline Result:*\n\`\`\`\n${reply}\n\`\`\``);
        }
      );
    },
  },

  "/sources": {
    desc: "List active RSS sources",
    handler: async (chatId) => {
      const out = await shell(
        "node -e \"const s=JSON.parse(require('fs').readFileSync('data/rss-sources.json','utf8'));" +
        "const on=s.filter(x=>x.enabled);const off=s.length-on.length;" +
        "console.log('✅ '+on.length+' active / ❌ '+off+' disabled\\n');" +
        "on.forEach(x=>console.log('• '+x.name+' ['+x.category+']'))\""
      );
      await sendMessage(chatId, `📡 *RSS Sources:*\n\n${out}`);
    },
  },

  // ── Site Management (dangerous — require approval) ──────────────────────
  "/restart": {
    desc: "Restart the website",
    requiresApproval: true,
    handler: async (chatId) => {
      await askConfirmation(
        chatId,
        "🔄 *Restart website*\nThis will restart the zcybernews PM2 process. Site will be briefly unavailable.",
        async () => {
          await sendTyping(chatId);
          const out = await shell("pm2 restart zcybernews 2>&1 && echo '✅ Restarted' || echo '❌ Failed'");
          await sendMessage(chatId, out);
        }
      );
    },
  },

  "/build": {
    desc: "Rebuild & restart site",
    requiresApproval: true,
    handler: async (chatId) => {
      await askConfirmation(
        chatId,
        "🔨 *Rebuild & restart site*\nThis will run npm build and restart PM2. Takes about 1 minute. Site will be briefly unavailable.",
        async () => {
          await sendMessage(chatId, "🔨 Building... This takes about 1 minute.");
          await sendTyping(chatId);
          const out = await shell(
            "cd /home/zcybernews/zcybernews && NODE_OPTIONS='--max-old-space-size=512' HUSKY=0 npm run build 2>&1 | tail -5 && pm2 restart zcybernews && echo '✅ Build & restart complete' || echo '❌ Build failed'"
          );
          await sendMessage(chatId, `\`\`\`\n${out}\n\`\`\``);
        }
      );
    },
  },

  "/pull": {
    desc: "Git pull latest",
    requiresApproval: true,
    handler: async (chatId) => {
      await askConfirmation(
        chatId,
        "📥 *Git pull from origin/main*\nThis will pull the latest code from GitHub.",
        async () => {
          await sendTyping(chatId);
          const out = await shell("git pull origin main 2>&1");
          await sendMessage(chatId, `📥 *Git Pull:*\n\`\`\`\n${out}\n\`\`\``);
        }
      );
    },
  },

  "/gitlog": {
    desc: "Last 10 git commits",
    handler: async (chatId) => {
      const out = await shell("git log --oneline -10");
      await sendMessage(chatId, `📝 *Recent Commits:*\n\`\`\`\n${out}\n\`\`\``);
    },
  },

  "/errors": {
    desc: "Recent Next.js error logs",
    handler: async (chatId) => {
      const out = await shell("pm2 logs zcybernews --err --lines 20 --nostream 2>&1 | tail -20");
      await sendMessage(chatId, out ? `🔴 *Error Logs:*\n\`\`\`\n${out}\n\`\`\`` : "✅ No recent errors");
    },
  },
};

// ── Callback query handler (approve/deny buttons) ─────────────────────────
async function handleCallbackQuery(query) {
  const chatId = String(query.message?.chat?.id);
  if (chatId !== ALLOWED_CHAT) {
    await answerCallback(query.id, "⛔ Unauthorized");
    return;
  }

  const data = query.data; // e.g. "approve:3" or "deny:3"
  const [action, id] = data.split(":");

  const pending = pendingActions.get(id);
  if (!pending) {
    await answerCallback(query.id, "⏰ This action has expired");
    await editMessage(chatId, query.message.message_id, "⏰ _Action expired or already handled._");
    return;
  }

  pendingActions.delete(id);

  if (action === "approve") {
    await answerCallback(query.id, "✅ Approved!");
    await editMessage(
      chatId,
      query.message.message_id,
      `✅ *Approved:* ${pending.description.replace(/\*/g, "")}\n\n⏳ Executing...`
    );
    try {
      await pending.onApprove();
    } catch (err) {
      await sendMessage(chatId, `❌ Action failed: ${err.message}`);
    }
  } else {
    await answerCallback(query.id, "❌ Denied");
    await editMessage(
      chatId,
      query.message.message_id,
      `❌ *Denied:* ${pending.description.replace(/\*/g, "")}`
    );
  }
}

// ── Message router ─────────────────────────────────────────────────────────
async function handleMessage(msg) {
  const chatId = String(msg.chat.id);

  // Security: only respond to the owner
  if (chatId !== ALLOWED_CHAT) {
    await sendMessage(chatId, "⛔ Unauthorized. This bot is private.");
    return;
  }

  const text = msg.text?.trim();
  if (!text) return;

  // Check for registered command
  const cmd = text.split(" ")[0].toLowerCase();
  if (COMMANDS[cmd]) {
    await COMMANDS[cmd].handler(chatId, text);
    return;
  }

  // General message → send to Claude with pre-approved tools
  await sendTyping(chatId);
  const reply = await askClaude(text);
  await sendMessage(chatId, reply);
}

// ── Long polling loop ──────────────────────────────────────────────────────
async function poll() {
  while (true) {
    try {
      const data = await tgCall("getUpdates", {
        offset,
        timeout: 30,
        allowed_updates: ["message", "callback_query"],
      });

      if (data.ok && data.result?.length) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          if (update.callback_query) {
            handleCallbackQuery(update.callback_query).catch((e) =>
              console.error("Callback handler error:", e)
            );
          } else if (update.message) {
            handleMessage(update.message).catch((e) =>
              console.error("Message handler error:", e)
            );
          }
        }
      }
    } catch (err) {
      console.error("Poll error:", err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

// ── Start ──────────────────────────────────────────────────────────────────
console.log("🤖 ZCyberNews Telegram Bot started");
console.log(`   Allowed chat: ${ALLOWED_CHAT}`);
console.log(`   Working dir:  ${ROOT}`);

// Clear any pending updates from before
await tgCall("getUpdates", { offset: -1 });

poll();

// ==UserScript==
// @name         Syncro - Chat Helper
// @namespace    http://tampermonkey.net/
// @version      1.2.0
// @description  Extract and summarise Syncro chat conversations for copying into tickets. Provides plain transcript copy and Claude AI summary.
// @author       Des Quinn, Equinox ITC
// @match        https://*.syncromsp.com/chat/*
// @match        https://*.shield.syncromsp.com/chat/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @connect      api.anthropic.com
// ==/UserScript==

(function () {
  "use strict";

  // Shared API key storage key with Syncro-ClaudeAssist.js so one key covers both scripts.
  var CLAUDE_MODEL        = "claude-haiku-4-5-20251001";
  var CLAUDE_MAX_TOKENS   = 1500;
  var API_KEY_STORAGE_KEY = "tmClaudeApiKey";

  /* ═══════════════════ API KEY ═══════════════════ */
  function getStoredApiKey() {
    try { if (typeof GM_getValue === "function") return GM_getValue(API_KEY_STORAGE_KEY, "") || ""; } catch (e) {}
    return "";
  }
  function setStoredApiKey(key) {
    try { if (typeof GM_setValue === "function") GM_setValue(API_KEY_STORAGE_KEY, key || ""); } catch (e) {}
  }
  function promptForApiKey() {
    var current = getStoredApiKey();
    var entered = window.prompt("Enter your Anthropic API key (starts with sk-ant-).", current ? "sk-ant-..." : "");
    if (entered === null) return null;
    var trimmed = String(entered || "").trim();
    if (!trimmed || !trimmed.startsWith("sk-")) {
      window.alert("That doesn't look like a valid Anthropic API key. Please try again.");
      return null;
    }
    setStoredApiKey(trimmed);
    return trimmed;
  }
  function getApiKey() {
    var key = getStoredApiKey();
    if (!key) return promptForApiKey();
    return key;
  }

  /* ═══════════════════ DOM HELPERS ═══════════════════ */
  function safeText(el) {
    return el ? String(el.textContent || "").replace(/\s+/g, " ").trim() : "";
  }
  function safeBlockText(el) {
    if (!el) return "";
    var raw = String(el.innerText || el.textContent || "").replace(/\r/g, "");
    var lines = raw.split("\n");
    for (var i = 0; i < lines.length; i++) lines[i] = lines[i].replace(/[ \t]+$/g, "");
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  function firstText(selectors, root) {
    root = root || document;
    for (var i = 0; i < selectors.length; i++) {
      var el = root.querySelector(selectors[i]);
      if (el) { var t = safeText(el); if (t) return t; }
    }
    return "";
  }

  /* ═══════════════════ REACT CONTAINER ═══════════════════ */

  // The Syncro chat page is a React SPA mounted into this element — no chat HTML
  // exists in view-source. All content is injected client-side after the page loads.
  function getChatRoot() {
    return document.querySelector('[data-sidepack-react-class="tech-chat/RoutedTechChatApp"]');
  }

  // Poll until React has rendered meaningful content into the chat root.
  // Calls onReady(err, root) — err is null on success.
  function waitForReactContent(onReady, timeoutMs) {
    timeoutMs = timeoutMs || 12000;
    var start = Date.now();

    function check() {
      var root = getChatRoot();
      // Consider rendered when the root has at least a handful of descendent elements
      if (root && root.querySelectorAll("*").length > 10) {
        onReady(null, root);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        onReady(new Error("Timed out waiting for React content. Try again once the chat has fully loaded."), root || null);
        return;
      }
      setTimeout(check, 300);
    }
    check();
  }

  /* ═══════════════════ CHAT DATA EXTRACTION ═══════════════════ */
  function getChatIdFromPath() {
    var m = window.location.pathname.match(/\/chat\/[^/]+\/(\d+)/);
    return m ? m[1] : "";
  }

  // Returns the middle transcript pane. Scoping to this prevents the left-panel
  // .interaction-entry preview spans (which also use class "message") from being
  // accidentally scraped.
  function getChatTranscriptPane(root) {
    return (root || document).querySelector(".chat-box") || root || document;
  }

  // Returns the left-panel list entry for the active chat, matched by chat ID in href.
  // e.g. <a class="interaction-entry" href="/chat/all/822509">
  function getActiveChatListEntry(root, chatId) {
    if (!chatId) return null;
    return (root || document).querySelector('.interaction-entry[href$="/' + chatId + '"]');
  }

  // Returns { customer, contact, agent, asset } from the active chat's left-panel entry.
  function getChatParticipants(root, chatId) {
    var entry = getActiveChatListEntry(root, chatId);
    var get = function (sel) { var el = entry && entry.querySelector(sel); return el ? safeText(el) : ""; };
    return {
      customer: get(".customer-name"),
      contact:  get(".contact-name"),
      agent:    get(".user-name"),
      asset:    get(".asset-name")
    };
  }

  function getChatCustomerName(root, chatId) {
    // Primary: h2 in the transcript pane header ("EQ Office")
    var pane = getChatTranscriptPane(root);
    var h2 = pane.querySelector("h2");
    if (h2) { var t = safeText(h2); if (t) return t; }
    // Fallback: customer-name from the matching list entry
    var p = getChatParticipants(root, chatId);
    if (p.customer) return p.customer;
    // Last resort: page title
    var m = document.title.match(/^([^|-]+)/);
    if (m) { var t2 = m[1].trim(); if (t2 && t2.toLowerCase() !== "syncro" && t2.toLowerCase() !== "chat") return t2; }
    return "";
  }

  // Extracts messages using the confirmed Kendo UI chat widget structure.
  // .k-message-group.k-alt  = agent/tech side (right-aligned blue bubbles)
  // .k-message-group        = customer side   (left-aligned white bubbles)
  function getChatMessages(root, chatId) {
    var pane = getChatTranscriptPane(root);
    var p    = getChatParticipants(root, chatId);
    var agentLabel   = p.agent   || "Agent";
    var contactLabel = p.contact || "Customer";

    var messages = [];
    var seen = {};

    var groups = pane.querySelectorAll(".k-message-list-content .k-message-group");

    if (groups && groups.length > 0) {
      for (var g = 0; g < groups.length; g++) {
        var group  = groups[g];
        var sender = group.classList.contains("k-alt") ? agentLabel : contactLabel;

        var msgEls = group.querySelectorAll(".k-message");
        for (var mi = 0; mi < msgEls.length; mi++) {
          var msgEl  = msgEls[mi];
          var timeEl = msgEl.querySelector("time.k-message-time");
          var timestamp = timeEl ? (timeEl.getAttribute("datetime") || safeText(timeEl)) : "";
          var bubbleEl  = msgEl.querySelector(".k-chat-bubble");
          var body = bubbleEl ? safeBlockText(bubbleEl) : safeBlockText(msgEl);

          if (!body) continue;
          var key = sender + "|" + timestamp + "|" + body.substring(0, 80);
          if (seen[key]) continue;
          seen[key] = true;

          messages.push({ sender: sender, timestamp: timestamp, body: body });
        }
      }
    } else {
      // Fallback for any future layout change away from the Kendo widget.
      // Scoped to the transcript pane to avoid left-panel preview pollution.
      var fallbackSelectors = [
        ".chat-messages .message, .chat-messages .chat-message",
        ".messages-container .message",
        ".chat-bubble",
        "[data-testid='chat-message']",
        ".chat-message",
        ".message-item",
      ];
      var nodes = null;
      for (var s = 0; s < fallbackSelectors.length; s++) {
        var found = pane.querySelectorAll(fallbackSelectors[s]);
        if (found && found.length > 0) { nodes = found; break; }
      }
      if (nodes) {
        for (var i = 0; i < nodes.length; i++) {
          var node = nodes[i];
          var cls = typeof node.className === "string" ? node.className : "";
          var sender2 = "";
          if (/\b(sent|outgoing|k-alt|from-agent|agent|tech|staff|admin)\b/i.test(cls)) sender2 = agentLabel;
          else if (/\b(received|incoming|from-customer|customer|contact|visitor)\b/i.test(cls)) sender2 = contactLabel;
          var timeEl2 = node.querySelector("time, .timestamp, .time, [datetime]");
          var ts2 = timeEl2 ? (timeEl2.getAttribute("datetime") || safeText(timeEl2)) : "";
          var bodyEl = node.querySelector(".message-body, .message-content, p, [class*='body'], [class*='content']");
          var body2 = bodyEl ? safeBlockText(bodyEl) : safeBlockText(node);
          if (!body2 || body2.length < 2) continue;
          var key2 = (sender2 || "") + "|" + ts2 + "|" + body2.substring(0, 80);
          if (seen[key2]) continue;
          seen[key2] = true;
          messages.push({ sender: sender2 || "Unknown", timestamp: ts2, body: body2 });
        }
      }
    }

    return messages;
  }

  function formatTranscript(messages, chatId, customerName, participants) {
    var lines = [];
    lines.push("---- Chat Transcript ----");
    if (chatId)       lines.push("Chat ID:   " + chatId);
    if (customerName) lines.push("Customer:  " + customerName);
    if (participants) {
      if (participants.contact) lines.push("Contact:   " + participants.contact);
      if (participants.asset)   lines.push("Asset:     " + participants.asset);
      if (participants.agent)   lines.push("Tech:      " + participants.agent);
    }
    lines.push("URL:       " + window.location.href);
    lines.push("Extracted: " + new Date().toLocaleString());
    lines.push("-------------------------");
    lines.push("");

    if (!messages || !messages.length) {
      lines.push("(No messages found — the page structure may differ from expected.)");
      return lines.join("\n");
    }

    for (var i = 0; i < messages.length; i++) {
      var m = messages[i];
      var header = m.sender + (m.timestamp ? " [" + m.timestamp + "]" : "");
      lines.push(header + ":");
      lines.push(m.body);
      lines.push("");
    }
    return lines.join("\n").trim();
  }

  /* ═══════════════════ CLAUDE ═══════════════════ */
  function buildSummaryPrompt(transcript, customerName, chatId, participants) {
    var p = participants || {};
    var details = [
      "  Customer: " + (customerName || "Unknown"),
      p.contact ? "  Contact:  " + p.contact : null,
      p.asset   ? "  Asset:    " + p.asset   : null,
      p.agent   ? "  Tech:     " + p.agent   : null,
      "  Chat ID:  " + (chatId || "Unknown"),
      "  URL:      " + window.location.href,
    ].filter(Boolean);

    return [
      "You are assisting an MSP technician. A customer chat has just ended and the technician",
      "needs to add a concise note to the support ticket. Where the issue is not resolved suggest further follow on work or questions.",
      "",
      "Summarise the chat below in under 250 words. Structure the note as:",
      "  Issue: (what the customer raised)",
      "  Details: (key information provided by the customer)",
      "  Actions: (what the agent did or advised)",
      "  Status: (resolved / escalated / follow-up required — pick the most accurate)",
      "  Follow on work: (any further actions that may be required if the issue was not resolved)",
      "",
      "Write in third person (e.g. 'Customer reported...', 'Agent advised...').",
      "Use the contact's actual name rather than just 'customer' where it adds clarity.",
      "Be factual and professional. Do not invent information not in the transcript.",
      "",
      "Chat details:",
    ].concat(details).concat([
      "",
      "Transcript:",
      transcript
    ]).join("\n");
  }

  function callClaudeApi(apiKey, prompt) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: "POST",
        url: "https://api.anthropic.com/v1/messages",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        data: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: CLAUDE_MAX_TOKENS,
          messages: [{ role: "user", content: prompt }]
        }),
        onload: function (response) {
          try {
            var data = JSON.parse(response.responseText);
            if (response.status !== 200) {
              reject(new Error((data.error && data.error.message) ? data.error.message : "HTTP " + response.status));
              return;
            }
            var text = "";
            if (data.content) {
              for (var i = 0; i < data.content.length; i++) {
                if (data.content[i].type === "text") text += data.content[i].text;
              }
            }
            resolve(text || "(No response text returned)");
          } catch (e) {
            reject(new Error("Failed to parse API response: " + e.message));
          }
        },
        onerror:   function () { reject(new Error("Network error contacting Claude API.")); },
        ontimeout: function () { reject(new Error("Claude API request timed out.")); },
        timeout: 60000
      });
    });
  }

  /* ═══════════════════ PANEL UI ═══════════════════ */
  function injectStyles() {
    if (document.getElementById("tm-chat-styles")) return;
    var style = document.createElement("style");
    style.id = "tm-chat-styles";
    style.textContent = [
      "#tm-chat-overlay{position:fixed;inset:0;z-index:200000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;}",
      "#tm-chat-panel{background:#fff;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.28);width:min(820px,94vw);max-height:85vh;display:flex;flex-direction:column;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;}",
      "#tm-chat-panel-header{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #e0e0e0;background:#1a1a2e;border-radius:8px 8px 0 0;}",
      "#tm-chat-panel-header span{color:#fff;font-weight:700;font-size:14px;}",
      "#tm-chat-panel-hbtns{display:flex;gap:8px;}",
      "#tm-chat-panel-hbtns button{padding:4px 10px;border-radius:4px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.1);color:#fff;cursor:pointer;font-size:12px;font-weight:500;}",
      "#tm-chat-panel-hbtns button:hover{background:rgba(255,255,255,.25);}",
      "#tm-chat-panel-body{overflow-y:auto;padding:16px 18px;flex:1;white-space:pre-wrap;line-height:1.6;color:#222;font-size:12px;}",
      "#tm-chat-panel-footer{padding:10px 16px;border-top:1px solid #e0e0e0;display:flex;gap:8px;justify-content:flex-end;background:#f7f8fb;border-radius:0 0 8px 8px;flex-wrap:wrap;}",
      "#tm-chat-panel-footer button{padding:5px 14px;border-radius:4px;cursor:pointer;border:1px solid #c0c4cc;background:#fff;font-size:12px;font-weight:500;color:#333;}",
      "#tm-chat-panel-footer button:hover{background:#eef2f7;}",
      "#tm-chat-panel-footer .tm-chat-primary{background:#1a1a2e;color:#fff;border-color:#1a1a2e;}",
      "#tm-chat-panel-footer .tm-chat-primary:hover{background:#2d2d50;}",
      ".tm-chat-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;gap:12px;color:#555;}",
      ".tm-chat-spinner{width:32px;height:32px;border:3px solid #e0e0e0;border-top-color:#1a1a2e;border-radius:50%;animation:tm-chat-spin .8s linear infinite;}",
      "@keyframes tm-chat-spin{to{transform:rotate(360deg);}}",
      ".tm-chat-err{color:#8b1e1e;padding:12px;background:#fff5f5;border-radius:6px;border:1px solid #f5c6c6;}",
      ".tm-chat-err-actions{margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;}",
      ".tm-chat-err-actions button{padding:5px 12px;border-radius:4px;cursor:pointer;border:1px solid #c0c4cc;background:#fff;font-size:12px;font-weight:500;}",
      // Floating button
      "#tm-chat-fab{position:fixed;bottom:70px;right:14px;z-index:100090;}",
      "#tm-chat-fab-btn{background:#1a1a2e;color:#fff;border:none;border-radius:6px;padding:7px 14px;cursor:pointer;font-size:13px;font-weight:600;font-family:'Segoe UI',Arial,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,.3);white-space:nowrap;}",
      "#tm-chat-fab-btn:hover{background:#2d2d50;}",
      "#tm-chat-fab-menu{position:absolute;bottom:100%;right:0;margin-bottom:6px;background:#fff;border:1px solid #d9dce3;border-radius:6px;box-shadow:0 6px 18px rgba(0,0,0,.18);padding:4px;min-width:200px;display:none;}",
      "#tm-chat-fab-menu button{display:block;width:100%;text-align:left;padding:8px 12px;border:none;background:none;cursor:pointer;font-size:13px;font-family:'Segoe UI',Arial,sans-serif;border-radius:4px;color:#222;}",
      "#tm-chat-fab-menu button:hover{background:#eef2f7;}",
      "#tm-chat-fab-menu hr{margin:4px 0;border:none;border-top:1px solid #e6e9ef;}",
    ].join("\n");
    document.head.appendChild(style);
  }

  function showPanel(titleText) {
    injectStyles();
    var old = document.getElementById("tm-chat-overlay");
    if (old) old.remove();

    var overlay = document.createElement("div");
    overlay.id = "tm-chat-overlay";

    var panel = document.createElement("div");
    panel.id = "tm-chat-panel";

    var header = document.createElement("div");
    header.id = "tm-chat-panel-header";
    var titleEl = document.createElement("span");
    titleEl.textContent = titleText || "Chat Helper";
    var hbtns = document.createElement("div");
    hbtns.id = "tm-chat-panel-hbtns";
    var closeBtn = document.createElement("button");
    closeBtn.textContent = "Close";
    closeBtn.addEventListener("click", function () { overlay.remove(); });
    hbtns.appendChild(closeBtn);
    header.appendChild(titleEl);
    header.appendChild(hbtns);

    var body = document.createElement("div");
    body.id = "tm-chat-panel-body";

    var footer = document.createElement("div");
    footer.id = "tm-chat-panel-footer";
    var footerClose = document.createElement("button");
    footerClose.textContent = "Close";
    footerClose.addEventListener("click", function () { overlay.remove(); });
    footer.appendChild(footerClose);

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(footer);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });
    var onKey = function (e) { if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", onKey); } };
    document.addEventListener("keydown", onKey);

    return { overlay: overlay, body: body, footer: footer, titleEl: titleEl };
  }

  function setLoading(body, message) {
    body.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.className = "tm-chat-loading";
    var spinner = document.createElement("div");
    spinner.className = "tm-chat-spinner";
    var msg = document.createElement("span");
    msg.textContent = message || "Loading...";
    wrap.appendChild(spinner);
    wrap.appendChild(msg);
    body.appendChild(wrap);
  }

  function showTextResult(body, footer, text, copyLabel) {
    body.innerHTML = "";
    body.textContent = text;
    var copyBtn = document.createElement("button");
    copyBtn.textContent = copyLabel || "Copy";
    copyBtn.className = "tm-chat-primary";
    copyBtn.addEventListener("click", function () {
      try {
        if (typeof GM_setClipboard === "function") GM_setClipboard(text, "text");
        else navigator.clipboard.writeText(text);
        copyBtn.textContent = "Copied!";
        setTimeout(function () { copyBtn.textContent = copyLabel || "Copy"; }, 1800);
      } catch (e) {}
    });
    footer.insertBefore(copyBtn, footer.firstChild);
  }

  function showError(body, footer, errorMessage, onRetry) {
    body.innerHTML = "";
    var wrap = document.createElement("div");
    wrap.className = "tm-chat-err";
    var msg = document.createElement("div");
    msg.textContent = "Error: " + errorMessage;
    var actions = document.createElement("div");
    actions.className = "tm-chat-err-actions";
    if (typeof onRetry === "function") {
      var retryBtn = document.createElement("button");
      retryBtn.textContent = "Retry";
      retryBtn.addEventListener("click", function () { onRetry(); });
      actions.appendChild(retryBtn);
    }
    var rekeyBtn = document.createElement("button");
    rekeyBtn.textContent = "Update API Key";
    rekeyBtn.addEventListener("click", function () {
      var newKey = promptForApiKey();
      if (newKey && typeof onRetry === "function") onRetry(newKey);
    });
    actions.appendChild(rekeyBtn);
    wrap.appendChild(msg);
    wrap.appendChild(actions);
    body.appendChild(wrap);
  }

  /* ═══════════════════ TOAST ═══════════════════ */
  function showToast(message, isError) {
    var old = document.getElementById("tm-chat-toast");
    if (old) old.remove();
    var toast = document.createElement("div");
    toast.id = "tm-chat-toast";
    toast.textContent = message;
    Object.assign(toast.style, {
      position: "fixed", right: "14px", bottom: "14px", zIndex: "999999",
      background: isError ? "#8b1e1e" : "#1a1a2e", color: "#fff",
      padding: "10px 14px", borderRadius: "6px", boxShadow: "0 4px 12px rgba(0,0,0,.25)",
      fontFamily: "Segoe UI, Arial, sans-serif", fontSize: "12px", maxWidth: "420px"
    });
    document.body.appendChild(toast);
    setTimeout(function () { if (toast.parentNode) toast.remove(); }, 4200);
  }

  /* ═══════════════════ ACTIONS ═══════════════════ */
  function doCopyTranscript() {
    var chatId = getChatIdFromPath();
    var parts  = showPanel("Chat Transcript" + (chatId ? " #" + chatId : ""));
    setLoading(parts.body, "Waiting for chat to render...");

    waitForReactContent(function (err, root) {
      if (err) {
        showError(parts.body, parts.footer, err.message, function () { doCopyTranscript(); });
        return;
      }
      var customerName = getChatCustomerName(root, chatId);
      var participants = getChatParticipants(root, chatId);
      var messages     = getChatMessages(root, chatId);
      var transcript   = formatTranscript(messages, chatId, customerName, participants);

      if (customerName) parts.titleEl.textContent = "Chat Transcript - " + customerName;
      showTextResult(parts.body, parts.footer, transcript, "Copy Transcript");

      if (!messages.length) {
        showToast("No messages extracted. Use 'Debug: Dump Structure' to identify the rendered class names.", true);
      } else {
        showToast(messages.length + " message(s) extracted.", false);
      }
    });
  }

  function doClaudeSummary(overrideKey) {
    var apiKey = overrideKey || getApiKey();
    if (!apiKey) return;

    var chatId = getChatIdFromPath();
    var parts  = showPanel("Claude Summary" + (chatId ? " #" + chatId : ""));
    setLoading(parts.body, "Waiting for chat to render...");

    waitForReactContent(function (err, root) {
      if (err) {
        showError(parts.body, parts.footer, err.message, function () { doClaudeSummary(apiKey); });
        return;
      }
      var customerName = getChatCustomerName(root, chatId);
      var participants = getChatParticipants(root, chatId);
      var messages     = getChatMessages(root, chatId);

      if (!messages.length) {
        showError(
          parts.body, parts.footer,
          "No messages found in the rendered chat. Use 'Debug: Dump Structure' to identify the class names.",
          null
        );
        return;
      }

      var transcript = formatTranscript(messages, chatId, customerName, participants);
      var prompt     = buildSummaryPrompt(transcript, customerName, chatId, participants);
      if (customerName) parts.titleEl.textContent = "Claude Summary - " + customerName;

      function doApiCall(key) {
        setLoading(parts.body, "Waiting for Claude response...");
        callClaudeApi(key, prompt).then(function (text) {
          parts.titleEl.textContent = "Claude Summary" + (customerName ? " - " + customerName : "");
          showTextResult(parts.body, parts.footer, text, "Copy Summary");
        }).catch(function (err) {
          showError(parts.body, parts.footer, err.message || "Unknown error", function (newKey) {
            var useKey = newKey || key;
            if (newKey) setStoredApiKey(newKey);
            doApiCall(useKey);
          });
        });
      }
      doApiCall(apiKey);
    });
  }

  // Dumps the raw innerHTML of the React chat container so the actual rendered
  // class names can be identified and the selectors above can be tightened.
  function doDebugDump() {
    var chatId = getChatIdFromPath();
    var parts  = showPanel("Debug: React Structure" + (chatId ? " #" + chatId : ""));
    setLoading(parts.body, "Waiting for React to render...");

    waitForReactContent(function (err, root) {
      var dumpLines = [];
      dumpLines.push("Chat root selector: [data-sidepack-react-class='tech-chat/RoutedTechChatApp']");
      dumpLines.push("Root found: " + (root ? "YES" : "NO"));

      if (root) {
        dumpLines.push("Descendent elements: " + root.querySelectorAll("*").length);
        dumpLines.push("");
        dumpLines.push("--- innerHTML (first 5000 chars) ---");
        dumpLines.push(root.innerHTML.substring(0, 5000));
      } else {
        dumpLines.push("");
        dumpLines.push("React root not found in DOM.");
        dumpLines.push("data-sidepack-react-class attribute may have changed.");
      }

      if (err) {
        dumpLines.unshift("WARNING: " + err.message);
        dumpLines.unshift("");
      }

      var dump = dumpLines.join("\n");
      showTextResult(parts.body, parts.footer, dump, "Copy Debug Dump");
      showToast("Debug dump ready. Copy it and share with the developer to update selectors.", false);
    });
  }

  /* ═══════════════════ FLOATING BUTTON ═══════════════════ */
  function injectFloatingButton() {
    if (document.getElementById("tm-chat-fab")) return;
    injectStyles();

    var fab = document.createElement("div");
    fab.id = "tm-chat-fab";

    var fabBtn = document.createElement("button");
    fabBtn.id = "tm-chat-fab-btn";
    fabBtn.textContent = "Chat Helper ▾";
    fabBtn.title = "Syncro Chat Helper";

    var menu = document.createElement("div");
    menu.id = "tm-chat-fab-menu";

    function setOpen(open) { menu.style.display = open ? "block" : "none"; }

    function addItem(label, fn) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.addEventListener("click", function (e) { e.stopPropagation(); setOpen(false); fn(); });
      menu.appendChild(btn);
    }

    addItem("Copy Transcript",        doCopyTranscript);
    addItem("Summarise with Claude",  function () { doClaudeSummary(); });
    var sep = document.createElement("hr");
    menu.appendChild(sep);
    addItem("Debug: Dump Structure",  doDebugDump);
    var sep2 = document.createElement("hr");
    menu.appendChild(sep2);
    addItem("API Key Settings", function () {
      var newKey = promptForApiKey();
      if (newKey) showToast("API key saved.", false);
    });

    fabBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      setOpen(menu.style.display !== "block");
    });

    document.addEventListener("click", function () { setOpen(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setOpen(false); });

    fab.appendChild(menu);
    fab.appendChild(fabBtn);
    document.body.appendChild(fab);
  }

  /* ═══════════════════ BOOT ═══════════════════ */
  function boot() {
    injectFloatingButton();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

})();

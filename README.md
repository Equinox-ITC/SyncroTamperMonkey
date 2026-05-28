<p align="center">
  <img src="SyncroTicketsHelperLogo.png" alt="Syncro Tickets Helper Logo" width="600">
</p>

<p align="center">
  Faster Syncro ticket workflows. Less clicking. Better structure.
</p>

# Syncro Tampermonkey Helper Scripts

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Status: Active](https://img.shields.io/badge/Status-Active-blue)
![Platform: Syncro](https://img.shields.io/badge/Platform-Syncro-orange)
![Maintained](https://img.shields.io/badge/Maintained-Yes-brightgreen)
![Release](https://img.shields.io/github/v/release/Equinox-ITC/SyncroTamperMonkey)

A collection of Tampermonkey userscripts that improve day-to-day working in Syncro — faster time entry, copy helpers, sticky headers, AI-assisted ticket and chat summaries, and asset management tools.

## Scripts in This Collection

| Script | Page | Purpose |
|---|---|---|
| `SyncroTickets.user.js` | `/tickets/*` | Time entry, copy buttons, sticky header, canned responses, WoC |
| `SyncroCopilotAssist.user.js` | `/tickets/*` | Build a structured Copilot prompt from ticket context |
| `Syncro-ClaudeAssist.js` | `/tickets/*` | Send ticket context to Claude AI and display the response inline |
| `Syncro-ChatHelper.User.js` | `/chat/*` | Extract and summarise chat conversations for copying into tickets |
| `SyncroAssetFilter.user.js` | `/customer_assets*` | Filter assets by online status and bulk-select online devices |

## Quick Start (2 minutes)

1. Install Tampermonkey
2. Install the scripts you need (direct install links in the Installation section below)
3. Open the relevant Syncro page

Done. Each script loads automatically on its matched pages.

## How It Works

- Each userscript loads only on the Syncro pages that match its `@match` rules.
- Scripts that use the Claude API (`Syncro-ClaudeAssist.js`, `Syncro-ChatHelper.User.js`) require an Anthropic API key stored in Tampermonkey. Both scripts share the same stored key so it only needs to be entered once.
- The main ticket helper and asset filter work entirely in the browser with no external services or API keys required.
- Copilot Assist stores only your preferred Copilot chat URL in your browser/Tampermonkey profile.

## How To Use It

- Install the userscripts in Tampermonkey and open the relevant Syncro page.
- Use the added buttons in the ticket header for quick copy actions, sticky navigation, and status/comment workflow shortcuts.
- Use the time helper fields and keyboard shortcuts directly in the ticket labor log or comment forms.
- Right-click inside the comment editor to open the custom menu with standard editing actions and canned responses.
- Use **Claude Assist** for an AI-generated response or diagnosis suggestion directly on the ticket page.
- Use **Chat Helper** after a chat conversation to copy the transcript or generate a summary for the ticket.
- Use **Asset Filter** on a customer assets page to show only online devices or select them all for bulk script runs.

## Features

### SyncroTickets.user.js — Ticket Helper (v2.8.12)

#### Time and Duration Helpers

- Smart duration parsing and normalization in helper bars:
  - `25m`, `2h`, `1.5`, `1:25`
  - Mixed hour/minute text values
- Duration presets: `5m`, `10m`, `15m`, `30m`, `45m`, `1h`, `1.5h`, `2h`
- Smart duration field entry controls:
  - Mouse wheel on duration input: +/- 5 minutes
  - Arrow Up/Down: +/- 15 minutes
  - Shift + Arrow Up/Down: +/- 30 minutes
  - Enter to apply duration
  - Escape to clear duration input
- Auto duration application logic:
  - If `From` is populated, script calculates and sets `To`
  - If `From` is blank, script sets `To` to now and back-calculates `From`
- Labor Log helper bar (React/MUI form)
- Comment form helper bar (Bootstrap/jQuery form)
- Time field controls (start/end fields):
  - Arrow Up/Down: +/- 1 minute
  - Shift + Arrow Up/Down: +/- 5 minutes
  - Ctrl or Alt + Arrow Up/Down: +/- 60 minutes
  - Mouse wheel: +/- 5 minutes
- Product/service select wheel support:
  - Mouse wheel cycles selected option and dispatches change event
- Date wheel support:
  - Mouse wheel adjusts date by +/- 1 day
  - Uses datepicker API when available, with native fallback

#### Ticket Copy Actions

Copy buttons appear in the ticket header bar. Button text is shown in blue.

- **URL** — copies the ticket URL
- **TSU** — copies ticket number + subject + URL (one-line format for pasting into chat or notes)
- **Email Subject** — copies `Subject (message id: TicketNum)` formatted for use as an email reply subject line
- **Details** — copies a formatted ticket summary block
- Click the ticket heading to copy the ticket number
- Customer info copy support from field icons:
  - Customer
  - Assigned contact
  - Email
  - Phone
  - Contact mobile
  - Primary address
  - Ticket address
- Empty-copy guards to prevent copying blank values

#### Ticket UI Enhancements

- Sticky multi-row ticket header region for easier scrolling
- WoC button to submit comment and set status to Waiting on Customer
- Context menu in comment editor with canned responses
- Ticket number copy from heading click
- Native browser tooltips for script-added controls

#### Comment Editor Context Menu Enhancements

- Custom right-click menu inside comment editor
- Built-in Copy/Cut/Paste actions
- Subject-aware canned response insertion
- Uses full canned body from `data-body` attributes (HTML-decoded)

#### Canned Response Subject Matching (How It Works)

The right-click menu in the comment editor can show canned responses based on the currently selected comment subject.

How the script filters canned responses:

- Right-click inside the comment editor (`.note-editable` or `#comment_body`) to open the custom menu.
- The script reads the current value of the comment subject field (`#comment_subject`).
- If a comment subject is selected, only canned responses with a matching subject are shown.
- Matching is case-insensitive, but it is an exact text match (not partial/contains).
- If the comment subject field is blank, the script shows all canned responses that have a valid canned body.

How to configure canned responses in Syncro:

1. Open your canned response list in Syncro and edit/create a canned response.
2. Set the canned response Subject/Matching Subject to the exact same subject value technicians choose in the ticket comment subject field.
3. Save the canned response body content normally.
4. In a ticket, choose that same comment subject first, then right-click in the editor to see matching canned entries.

Important behavior notes:

- If no canned entries appear, first confirm a comment subject is selected and that the canned response subject matches exactly.
- Canned entries without a mapped subject will not appear when a subject is selected.
- The menu always includes Copy/Cut/Paste; the Canned responses section appears only when matching entries are found.
- The script inserts the full canned response body (decoded from HTML entities), so formatting/content is preserved better than truncated table text.

#### Reliability and Performance Improvements

- Mutation filtering to reduce unnecessary reinjection cycles
- Per-step injection isolation (one failing feature does not block others)
- Polling bootstrap that exits early when features are loaded
- Per-cycle widget lookup cache to reduce repeated DOM scans
- Empty-copy guards to avoid copying blank values

---

### SyncroCopilotAssist.user.js — Copilot Assist (v1.2.6)

- Adds a **Copilot Assist** button to ticket pages
- Collects key ticket context (ticket number, subject, status, priority, assignee, customer/contact info, latest comment snippet, link)
- Builds a structured prompt for response drafting and diagnosis support
- Copies the prompt to clipboard and opens Copilot in a new tab
- Supports assist modes:
  - Response draft
  - Technical diagnosis
  - Both
- Supports a user-configurable Copilot URL (including custom agents)

#### Copilot Assist Usage and URL Configuration

How to use Copilot Assist on a ticket:

1. Click **Copilot Assist** in the ticket action bar.
2. Choose a mode from the dropdown:
  - Both (Response + Diagnosis)
  - Response Draft
  - Diagnosis Help
3. The script copies ticket context to clipboard and opens your configured Copilot URL in a new tab.
4. Paste the prompt into Copilot with `Ctrl+V` (or `Cmd+V` on macOS).

How to configure your Copilot URL:

1. On the ticket page, **Shift+Click** the **Copilot Assist** button.
2. Enter your preferred Copilot URL when prompted.
3. Save to store the URL for your user/browser profile.
4. Leave it blank to clear your preference and return to standard Copilot chat.

URL requirements and validation:

- URL must be HTTPS.
- Host must be `m365.cloud.microsoft`.
- Path must begin with `/chat`.
- Invalid URLs are rejected so technicians do not accidentally store malformed/non-Copilot links.

---

### Syncro-ClaudeAssist.js — Claude Assist (v1.0.0)

- Adds a **Claude Assist** panel directly on Syncro ticket pages
- Sends ticket context (number, subject, status, priority, customer, latest comment) to the Claude API
- Displays Claude's response in an inline panel without leaving the ticket
- Uses `claude-haiku-4-5` by default (cost-efficient); model can be changed in the script header
- Requires an Anthropic API key — stored securely in Tampermonkey storage, shared with Chat Helper so it only needs to be entered once

#### Claude Assist Setup

1. Open any Syncro ticket page.
2. Click the **Claude Assist** button that appears in the ticket header.
3. Enter your Anthropic API key when prompted (starts with `sk-ant-`).
4. The key is saved in Tampermonkey storage and reused for all future requests.

To update the key: click the **API Key** button in the Claude Assist panel.

---

### Syncro-ChatHelper.User.js — Chat Helper (v1.2.0)

- Adds a floating **Chat Helper** button on Syncro chat pages (`/chat/*`)
- Extracts the chat transcript from the active conversation in the middle pane
- Identifies the customer organisation, contact name, asset, and technician from the chat sidebar
- Provides three actions via a dropdown menu:
  - **Copy Transcript** — formats the full conversation as plain text ready to paste into a ticket comment
  - **Summarise with Claude** — sends the transcript to Claude and returns a concise structured note (Issue / Details / Actions / Status)
  - **Debug: Dump Structure** — exports the live React DOM structure for diagnosing selector issues
- Requires an Anthropic API key — shared with Claude Assist (same stored key)
- Uses `claude-haiku-4-5` for cost-efficient summarisation

#### Chat Helper Usage

1. Open a chat conversation in Syncro (`/chat/all/{id}`).
2. Click **Chat Helper ▾** (floating button, bottom-right of page).
3. Choose **Copy Transcript** or **Summarise with Claude**.
4. Copy the result from the panel and paste into the ticket.

---

### SyncroAssetFilter.user.js — Asset Filter (v1.3.0)

- Adds a toolbar above the asset table on customer asset pages
- **Show Online Only / Show All Devices** toggle — hides offline assets to make bulk targeting easier
- **Select All Online** — checks the checkbox for every online device in the current page view, ready for a bulk script run
- Live count badge showing online devices vs total (e.g. `12 online / 47 devices`)
- Works with Syncro's React-rendered status icons using the `span.tooltipper` tooltip pattern
- MutationObserver-driven so it responds as React renders status dots asynchronously

#### Asset Filter Usage

1. Open a customer's Assets page in Syncro.
2. The toolbar appears automatically above the asset table.
3. Click **Show Online Only** to hide offline devices.
4. Click **Select All Online** to tick all visible online devices.
5. Use Syncro's **Bulk Actions** menu to run a script against the selected devices.

---

## Feature Configuration Summary

| Script | Requires API key | User config |
|---|---|---|
| `SyncroTickets.user.js` | No | None required |
| `SyncroCopilotAssist.user.js` | No | Copilot URL (Shift+Click the button) |
| `Syncro-ClaudeAssist.js` | Yes — Anthropic | API key (prompted on first use) |
| `Syncro-ChatHelper.User.js` | Yes — Anthropic (shared) | API key (prompted on first use) |
| `SyncroAssetFilter.user.js` | No | None required |

Claude Assist and Chat Helper share the same Tampermonkey storage key for the Anthropic API key — entering it once covers both scripts.

## Requirements

- Google Chrome, Microsoft Edge, or Firefox
- Tampermonkey browser extension
- Access to the target Syncro tenant URLs
- Permission to run userscripts in the browser
- Anthropic API key (required for Claude Assist and Chat Helper only)

## Installation

### 1. Install Tampermonkey

Install Tampermonkey from the browser extension store:

- Chrome Web Store
- Microsoft Edge Add-ons
- Firefox Add-ons

### 2. Install Userscripts

Option A: Install from GitHub raw URL

Open a raw script URL in your browser. Tampermonkey will detect it and prompt to install.

Direct install URLs:

```
https://raw.githubusercontent.com/Equinox-ITC/SyncroTamperMonkey/main/SyncroTickets.user.js
https://raw.githubusercontent.com/Equinox-ITC/SyncroTamperMonkey/main/SyncroCopilotAssist.user.js
https://raw.githubusercontent.com/Equinox-ITC/SyncroTamperMonkey/main/Syncro-ClaudeAssist.js
https://raw.githubusercontent.com/Equinox-ITC/SyncroTamperMonkey/main/Syncro-ChatHelper.User.js
https://raw.githubusercontent.com/Equinox-ITC/SyncroTamperMonkey/main/SyncroAssetFilter.user.js
```

Option B: Manual install

1. Open Tampermonkey dashboard.
2. Create a new script.
3. Paste the contents of the script file.
4. Save.

## Auto Updates via GitHub

Tampermonkey can auto-update userscripts when the metadata includes `@updateURL` and `@downloadURL` pointing to GitHub raw URLs. All scripts in this repository already include these lines pointing to the `Equinox-ITC/SyncroTamperMonkey` repository.

Generic format:

```javascript
// @downloadURL  https://raw.githubusercontent.com/Equinox-ITC/SyncroTamperMonkey/main/<filename>
// @updateURL    https://raw.githubusercontent.com/Equinox-ITC/SyncroTamperMonkey/main/<filename>
```

After installation, Tampermonkey will check for updates according to its configured update interval.

## Access and Scope Control

Each script is scoped to the specific Syncro pages it needs:

```javascript
// SyncroTickets.user.js + SyncroCopilotAssist.user.js + Syncro-ClaudeAssist.js
// @match        https://*.syncromsp.com/tickets/*
// @match        https://*.shield.syncromsp.com/tickets/*

// Syncro-ChatHelper.User.js
// @match        https://*.syncromsp.com/chat/*
// @match        https://*.shield.syncromsp.com/chat/*

// SyncroAssetFilter.user.js
// @match        https://*.syncromsp.com/customer_assets*
```

To enable additional Syncro tenant domains, add matching `@match` lines to the relevant script.

## Credits

- **Nick Fratangelo**: Original concept and initial build of the ticket helper script. Original project: https://github.com/esperto/Syncro-TamperMonkey
- **Gary Herbstman**: Expanded and optimised the ticket helper; implemented GitHub-based auto-update support; wrote the original Copilot Assist script.
- **Des Quinn, Equinox ITC**: Ongoing development — v2.8.12 ticket helper additions (Email Subject button, blue copy button styling, theme refresh bug fixes); Claude Assist script; Chat Helper script; Asset Filter script; repository migration to Equinox-ITC.

## Development

Repository files:

- `SyncroTickets.user.js` — main ticket workflow helper (v2.8.12)
- `SyncroCopilotAssist.user.js` — Copilot prompt builder and launcher (v1.2.6)
- `Syncro-ClaudeAssist.js` — Claude AI inline ticket assist (v1.0.0)
- `Syncro-ChatHelper.User.js` — chat transcript extractor and Claude summariser (v1.2.0)
- `SyncroAssetFilter.user.js` — customer asset page online filter and bulk selector (v1.3.0)

## Troubleshooting

- If changes do not appear, do a hard refresh (Ctrl+Shift+R).
- If updates are not detected, verify `@updateURL` and `@downloadURL` values in the script header.
- Confirm Tampermonkey script is enabled.
- Check that the URL matches one of the script's `@match` patterns.
- For Copilot Assist, if Copilot does not open automatically, allow popups/new tabs for the site.
- For Copilot Assist URL issues, use **Shift+Click** on the button to reconfigure the saved URL.
- Ensure configured Copilot URLs follow `https://m365.cloud.microsoft/chat...`.
- For canned responses, ensure the ticket comment subject value exactly matches the canned response matching subject.
- For Claude Assist / Chat Helper, if the API key prompt does not appear, check that Tampermonkey has `GM_setValue` / `GM_getValue` grants enabled for the script.
- For Chat Helper, if the transcript shows 0 messages, use **Debug: Dump Structure** from the menu and share the output to help diagnose selector changes in the Syncro UI.
- For Asset Filter, if the online count shows 0, ensure the status tooltips have finished rendering (wait a moment after page load).

## Important Scope Notes

- Scripts run locally in your browser only.
- `SyncroTickets.user.js`, `SyncroCopilotAssist.user.js`, and `SyncroAssetFilter.user.js` do not transmit any data externally.
- `Syncro-ClaudeAssist.js` and `Syncro-ChatHelper.User.js` send ticket and chat content to the Anthropic API (`api.anthropic.com`) using your stored API key. No data is sent to any other service. Review Anthropic's privacy policy before use if your tickets contain sensitive customer data.
- Behavior depends on Syncro's frontend and may require selector updates if Syncro changes its UI.

## License and Disclaimer

This project is released under the MIT License.

This script is tailored to specific Syncro page structure and may need updates if Syncro changes its frontend markup or behavior.

You are free to use, copy, modify, distribute, and reuse this code for personal, commercial, or internal projects, provided that the original copyright and license notice are included.

This software is provided "as is", without warranty of any kind. The authors make no guarantees regarding its performance, reliability, or suitability for any particular purpose.

By using this code, you assume all risk. The authors are not liable for any damages, data loss, service disruption, or other issues that may arise from its use.

The MIT License (MIT)
Copyright © 2026 Equinox IT Consultancy

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

# Setting Up Local Claude Code for This Project

These instructions get the **local Claude Code app/CLI** on your own machine
working with the GitHub repo `benergy80/interstellarslingshot` the same way the
web version does — plus enabling browser tools, which are not available in the
web environment.

---

## Part 1 — Paste this to your local Claude Code

Open a terminal, run `claude` in any directory, and paste the block below. It
tells local Claude Code exactly what to set up.

> Set up this machine to work on my GitHub project `benergy80/interstellarslingshot`.
> Do the following, checking prerequisites as you go and asking me before
> anything destructive:
>
> 1. Clone `https://github.com/benergy80/interstellarslingshot.git` into my
>    current directory (skip if it's already cloned) and `cd` into it.
> 2. Make sure the GitHub CLI `gh` is installed and authenticated
>    (`gh auth status`; if not authenticated, walk me through `gh auth login`).
> 3. Verify you can access the repo via `gh` (list open PRs and issues as a test).
> 4. Tell me whether the GitHub MCP server is configured; if not, give me the
>    `claude mcp add` command for it but do not run it without my OK.
> 5. Confirm the project runs locally (open `index.html` — it's a static
>    browser game; check `css/`, `js/`, `audio/`, `images/`, `models/`).
> 6. Summarize what's set up and what I still need to do manually.

---

## Part 2 — Manual setup (if you'd rather do it yourself)

### 2.1 Clone and open the project

```bash
git clone https://github.com/benergy80/interstellarslingshot.git
cd interstellarslingshot
claude
```

The local CLI works on this real clone on your disk. (The web version
auto-provisions an ephemeral container instead — that's the main difference.)

### 2.2 GitHub access (equivalent to the web version's GitHub integration)

**Option A — `gh` CLI (recommended, simplest).** Claude Code uses this by
default for PRs, issues, and CI:

```bash
# Install: macOS `brew install gh`  |  others: https://cli.github.com
gh auth login          # choose GitHub.com, HTTPS, follow the prompts
gh auth status         # verify
```

**Option B — GitHub MCP server (gives the same `mcp__github__*` tools the web
session has).** Create a fine-grained PAT at
https://github.com/settings/personal-access-tokens, then:

```bash
claude mcp add --transport http github https://api.githubcopilot.com/mcp/ \
  --header "Authorization: Bearer YOUR_GITHUB_PAT"
```

Run `/mcp` inside a Claude Code session to finish/verify auth.

### 2.3 Optional — `@claude` on GitHub (server-side)

Inside a session, run:

```
/install-github-app
```

This installs the GitHub Action so mentioning `@claude` on a PR/issue triggers
it automatically. This runs in GitHub Actions, separate from your local
sessions — use both: local Claude for editing, the Action for async PR review.

---

## Part 3 — Browser tools (local only)

Browser automation is **not** available in the web environment but **is**
available locally.

**Official — Claude in Chrome:**

```bash
claude --chrome        # or run /chrome inside an existing session
```

Prerequisites: Chrome or Edge, the Claude Chrome extension (v1.0.36+), Claude
Code v2.0.73+, and a Pro/Max/Team/Enterprise plan. This lets Claude navigate
pages, click, type, read the console, and inspect the DOM — useful for testing
this game in a real browser.

**Alternative — Playwright MCP:**

```bash
claude mcp add playwright npx @playwright/mcp@latest
```

---

## Quick reference: web vs. local

| Thing            | Web version                     | Local version                          |
|------------------|---------------------------------|----------------------------------------|
| Repo clone       | Auto-provisioned ephemeral box  | You clone it yourself                   |
| GitHub auth      | Pre-wired MCP + `gh`            | `gh auth login` (+ optional MCP)        |
| MCP config       | Preconfigured by Anthropic      | You run `claude mcp add`                |
| Browser tools    | Not available                   | `claude --chrome` or Playwright MCP     |
| Persistence      | Ephemeral — must push to keep   | Lives on your disk                      |

**Start here:** clone the repo, run `gh auth login`, then `claude`. That alone
matches the web version's GitHub workflow. Add the GitHub MCP server only if
you want the exact `mcp__github__*` toolset, and use `claude --chrome` when you
need to test the game in a browser.

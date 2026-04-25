---
name: 5idream-local-activities
description: Refresh and summarize local 5idream activities by running the local Node scraper instead of MCP. Use when the task is to fetch the latest unfinished 5idream activities, recover after MCP timeouts, update the consolidated markdown document, preserve checklist state from the previous document, or reorder activities so unfinished items appear before finished ones.
---

# 5idream Local Activities

## Overview

Use this skill when working in this repository to refresh 5idream activity data with the local scraper and regenerate the Chinese integration markdown.

This skill replaces MCP extraction with a direct local command:

```powershell
node scripts/extract-active-activities.js
```

Run it in:

```powershell
apps/5idream-scraper
```

## Workflow

### 1. Refresh activities locally

Always prefer the local scraper over MCP for extraction:

```powershell
node scripts/extract-active-activities.js
```

Alternative:

```powershell
npm run extract-activities
```

Use the direct `node` command when the user explicitly asks to use the Node script.

If login has expired:

- let the browser wait for manual login
- after the user completes login, rerun the same command if needed

### 2. Read the authoritative outputs

Treat these files as the source of truth:

- `apps/5idream-scraper/outputs/activities/attachments/current-list.json`
- `apps/5idream-scraper/outputs/activities/attachments/index.json`
- `apps/5idream-scraper/outputs/activities/md/*.md`

Rules:

- `current-list.json` is the authoritative list of current unfinished activities
- only activities still present in `current-list.json` belong in the new integration document
- use `md\*.md` to extract actionable requirements
- if an activity is in `current-list.json` but its markdown detail is missing, keep it in the top checklist and note that detail capture is incomplete

### 3. Generate the integration document

Write the new markdown to:

```text
output/doc/5idream-activity-integration-YYYY-MM-DD.md
```

The document must stay in Chinese.

Required top-level structure:

```markdown
# 5idream 活动整合文档

## 一、所有活动总 Checklist

## 二、各活动具体信息和需要做的内容

## 三、建议优先级
```

### 4. Preserve checklist state from the previous document

Before writing a new document, read the most recent existing integration markdown in:

```text
output/doc
```

Preserve:

- the main checkbox state in `所有活动总 Checklist`
- the reminder subitems under that checklist

Do not preserve activities that no longer exist in the current list.

If an activity still exists:

- reuse its checked or unchecked state
- reuse its reminder subitems directly under the same top checklist item

### 5. Order unfinished before finished

Both in the top checklist and in the detailed sections:

- unfinished activities first
- finished activities after them

Determine finished status from the top checklist state in the previous document.

### 6. Convert raw activity text into actionable instructions

Do not just restate the original announcement.

For each activity include:

- activity time
- credits
- submission platform
- QQ group / course group / collection form / invite code
- what the user must actually do
- practical execution advice

Good conversions:

- replace vague text with concrete steps
- surface prerequisites such as sign-in, screenshots, joining Learning Pass, handing materials to class committee, or specific formatting rules
- mention urgency if the deadline is close
- mention low-effort opportunities when relevant

### 7. Report after completion

After writing the document, report:

- current number of unfinished activities captured
- output markdown path
- whether any duplicate activities were merged

## Editing rules

- keep output in Chinese
- use the current activity list only
- do not reintroduce activities that disappeared from the latest list
- if duplicate activities appear, merge them as one activity
- prefer concise, practical task descriptions over copied announcement text

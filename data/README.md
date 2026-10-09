# SI Telecom Prep — Data Rules

This folder is the app's only data. Claude writes these files. The app only reads them.

## Files

| File | What it holds |
|---|---|
| `syllabus.md` | Exam date, marking scheme, the 15 subjects with their Code and marks |
| `mcq/<Code>.md` | MCQs for one subject (example: `mcq/CN.md`) |
| `notes/<Code>.md` | Confusion-clearing / revision notes for one subject |

The app looks for `mcq/<Code>.md` and `notes/<Code>.md` for every Code in `syllabus.md`. A missing file just means "no questions yet".

## MCQ format

```
## Q: CN-TL-001
- Subject: Computer Science & Networking Systems
- Topic: Transport Layer
- Subtopic: TCP vs UDP
- Type: Factual | Conceptual | Application | Comparison | Confusion | Trap
- Difficulty: Easy | Medium | Hard
- Question: Which protocol is connection-oriented?
- Options:
  - TCP
  - UDP
  - IP
  - ICMP
- Answer: TCP
- Explanation: ...
- Memory Hint: ...
- Concept: ...
- Trap: ...
- Added: 2026-10-09
```

Rules:
1. **ID** = `<Code>-<TopicShort>-<number>`, e.g. `CN-TL-007`. Unique across all files. **Never rename or reuse an ID**: the app stores your progress under it.
2. **Answer** = the exact text of one option. Never `A`/`B`/`C`/`D`. The app shuffles options on every display.
3. One field per line. A long value may continue on the next line if indented.
4. Options: 2 or more, each on an indented `- ` line, no duplicates.
5. To fix a question, edit it in place and keep its ID. To retire one, add `- Status: Retired` instead of deleting it.
6. New questions are appended at the end of the subject file.

## Note format

```
## N: CN-N-001
- Subject: ...
- Topic: ...
- Title: TCP vs UDP
- Key Difference: ...
- Points:
  - ...
- Memory Trick: ...
- Exam Trap: ...
- Related Questions: CN-TL-001, CN-TL-002
```

Any extra `- Field:` line is shown in the app with its name as the label.

# MCQs — Digital Electronics & Microprocessors (DE)

Same format as every MCQ file. See data/README.md for the rules.

---

## Q: DE-LG-001
- Subject: Digital Electronics & Microprocessors
- Topic: Logic Gates
- Subtopic: Universal gates
- Type: Factual
- Difficulty: Easy
- Question: Which pair of gates are called universal gates?
- Options:
  - NAND and NOR
  - AND and OR
  - XOR and XNOR
  - NOT and AND
- Answer: NAND and NOR
- Explanation: Any logic circuit (AND, OR, NOT and everything built from them) can be made using only NAND gates, or only NOR gates. That is why they are "universal".
- Memory Hint: The two "N-gates" (NAND, NOR) can build aNything.
- Concept: Universal gates
- Trap: XOR and XNOR are special-purpose gates, not universal.
- Added: 2026-10-09

---

## Q: DE-LG-002
- Subject: Digital Electronics & Microprocessors
- Topic: Logic Gates
- Subtopic: XOR gate
- Type: Conceptual
- Difficulty: Easy
- Question: What is the output of a 2-input XOR gate when both inputs are 1?
- Options:
  - 0
  - 1
  - Undefined
  - Same as the previous output
- Answer: 0
- Explanation: XOR gives 1 only when the inputs are different. With inputs 1 and 1 they are the same, so the output is 0.
- Memory Hint: XOR = "eXclusive": one or the other, not both.
- Concept: XOR truth table
- Trap: OR gives 1 for inputs 1,1. XOR does not. Do not confuse XOR with OR.
- Added: 2026-10-09

---

## Q: DE-NS-001
- Subject: Digital Electronics & Microprocessors
- Topic: Number Systems
- Subtopic: Binary to decimal
- Type: Trap
- Difficulty: Easy
- Question: What is the decimal value of binary 1011?
- Options:
  - 11
  - 13
  - 22
  - 10
- Answer: 11
- Explanation: Place values from the right are 1, 2, 4, 8. So 1011 = 8×1 + 4×0 + 2×1 + 1×1 = 8 + 0 + 2 + 1 = 11.
- Memory Hint: Write 8 4 2 1 above the bits and add where the bit is 1.
- Concept: Positional weights in binary
- Trap: 13 comes from reading the bits in reverse (1101). Always start the weights from the rightmost bit.
- Added: 2026-10-09

# MCQs — Computer Science & Networking Systems (CN)

Format rules (the app depends on these):
- Each question starts with `## Q: <ID>`. IDs never change once created.
- One field per line: `- Field: value`. Options are an indented list under `- Options:`.
- `Answer` holds the exact text of the correct option, never a letter.
- `---` separates questions (optional, for readability).

---

## Q: CN-TL-001
- Subject: Computer Science & Networking Systems
- Topic: Transport Layer
- Subtopic: TCP vs UDP
- Type: Factual
- Difficulty: Easy
- Question: Which protocol is connection-oriented?
- Options:
  - TCP
  - UDP
  - IP
  - ICMP
- Answer: TCP
- Explanation: TCP sets up a connection (three-way handshake) before sending data and tracks it until it is closed. UDP just sends packets without any setup. IP and ICMP work at the network layer and are connectionless.
- Memory Hint: TCP = Telephone call (dial, connect, talk). UDP = posting letters (just send).
- Concept: Connection-oriented vs connectionless transport
- Trap: IP is the base of TCP/IP but IP itself is connectionless. "TCP/IP" does not make IP connection-oriented.
- Added: 2026-10-09

---

## Q: CN-TL-002
- Subject: Computer Science & Networking Systems
- Topic: Transport Layer
- Subtopic: TCP vs UDP
- Type: Application
- Difficulty: Easy
- Question: A live video call app needs low delay and can tolerate a few lost packets. Which transport protocol suits it best?
- Options:
  - UDP
  - TCP
  - ARP
  - ICMP
- Answer: UDP
- Explanation: UDP has no handshake and no retransmission, so it adds very little delay. In a live call, a late packet is useless anyway, so resending it (as TCP would) only causes lag.
- Memory Hint: Live = Light = UDP.
- Concept: Choosing TCP or UDP by application need
- Trap: "Reliable is always better" is wrong here. For real-time audio/video, speed matters more than perfect delivery.
- Added: 2026-10-09

---

## Q: CN-TL-003
- Subject: Computer Science & Networking Systems
- Topic: Transport Layer
- Subtopic: TCP vs UDP
- Type: Trap
- Difficulty: Medium
- Question: What is the minimum size of a TCP header?
- Options:
  - 20 bytes
  - 8 bytes
  - 32 bytes
  - 64 bytes
- Answer: 20 bytes
- Explanation: The TCP header is 20 bytes minimum and up to 60 bytes with options. The UDP header is a fixed 8 bytes, which is why UDP has lower overhead.
- Memory Hint: TCP 20 (heavy), UDP 8 (light).
- Concept: Header overhead of TCP and UDP
- Trap: 8 bytes is the UDP header size. Examiners place it as an option to catch students who mix the two.
- Added: 2026-10-09

---

## Q: CN-TL-004
- Subject: Computer Science & Networking Systems
- Topic: Transport Layer
- Subtopic: TCP vs UDP
- Type: Comparison
- Difficulty: Easy
- Question: Which of the following is NOT a feature of UDP?
- Options:
  - Guaranteed in-order delivery
  - Connectionless communication
  - No acknowledgements
  - Low overhead
- Answer: Guaranteed in-order delivery
- Explanation: UDP does not number its data for ordering and does not resend lost packets. Ordering and guaranteed delivery are TCP features.
- Memory Hint: UDP gives "no guarantees" — only speed.
- Concept: UDP characteristics
- Trap: Read "NOT" carefully. Three options are true for UDP; you must pick the false one.
- Added: 2026-10-09

---

## Q: CN-TL-005
- Subject: Computer Science & Networking Systems
- Topic: Transport Layer
- Subtopic: Well-known ports
- Type: Confusion
- Difficulty: Medium
- Question: Normal DNS name lookups use which protocol and port?
- Options:
  - UDP port 53
  - TCP port 80
  - UDP port 67
  - TCP port 25
- Answer: UDP port 53
- Explanation: A DNS query is a small request-reply, so it normally uses UDP on port 53. Port 80 is HTTP, 67 is DHCP server, 25 is SMTP.
- Memory Hint: Small question, quick answer → UDP. DNS 53, DHCP 67/68, both on UDP.
- Concept: Port numbers of common services
- Trap: DNS also uses TCP port 53 for zone transfers and large replies. If an option says "TCP and UDP 53", that can also be correct, so read all options.
- Added: 2026-10-09

---

## Q: CN-TL-006
- Subject: Computer Science & Networking Systems
- Topic: Transport Layer
- Subtopic: TCP connection setup
- Type: Conceptual
- Difficulty: Easy
- Question: What is the correct order of the TCP three-way handshake?
- Options:
  - SYN → SYN-ACK → ACK
  - SYN → ACK → SYN-ACK
  - ACK → SYN → SYN-ACK
  - SYN-ACK → SYN → ACK
- Answer: SYN → SYN-ACK → ACK
- Explanation: The client sends SYN (request), the server replies SYN-ACK (agree + request), the client sends ACK (confirm). Then data can flow.
- Memory Hint: "Hi?" → "Hi, you there?" → "Yes."
- Concept: TCP three-way handshake
- Trap: Connection release uses FIN, not SYN. Do not mix setup (SYN) with teardown (FIN).
- Added: 2026-10-09

---

## Q: CN-OSI-001
- Subject: Computer Science & Networking Systems
- Topic: OSI Model
- Subtopic: Layer functions
- Type: Factual
- Difficulty: Easy
- Question: At which OSI layer do TCP and UDP work?
- Options:
  - Transport layer (Layer 4)
  - Network layer (Layer 3)
  - Session layer (Layer 5)
  - Data link layer (Layer 2)
- Answer: Transport layer (Layer 4)
- Explanation: TCP and UDP carry data between applications on two hosts, which is the job of the transport layer. IP works at Layer 3 (network).
- Memory Hint: Layer 4 = 4-wheeler transport.
- Concept: OSI layer of transport protocols
- Trap: IP is Layer 3 and TCP/UDP are Layer 4. Do not put them on the same layer.
- Added: 2026-10-09

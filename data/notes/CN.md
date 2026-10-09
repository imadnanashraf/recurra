# Revision Notes — Computer Science & Networking Systems (CN)

Confusion-clearing notes. Each note starts with `## N: <ID>`.
Fields: Subject, Topic, Title, then any of: Key Difference, Points (list), Memory Trick, Exam Trap, Related Questions.

---

## N: CN-N-001
- Subject: Computer Science & Networking Systems
- Topic: Transport Layer
- Title: TCP vs UDP
- Key Difference: TCP is connection-oriented and reliable (it checks, orders and resends). UDP is connectionless and fast (it just sends).
- Points:
  - TCP: three-way handshake, acknowledgements, retransmission, flow and congestion control, in-order delivery. Header 20–60 bytes.
  - UDP: no handshake, no acknowledgements, no ordering. Header fixed 8 bytes.
  - TCP uses: web (HTTP/HTTPS), email (SMTP), file transfer (FTP), remote login (SSH).
  - UDP uses: DNS queries, DHCP, live video/voice, online games, SNMP, TFTP.
  - Both work at the transport layer (OSI Layer 4).
- Memory Trick: TCP = Telephone call (connect first, confirm everything). UDP = posting letters (drop in the box and hope).
- Exam Trap: "Reliable" questions point to TCP. "Fast / real-time / low overhead" questions point to UDP. DNS uses UDP 53 normally but TCP 53 for zone transfers.
- Related Questions: CN-TL-001, CN-TL-002, CN-TL-003, CN-TL-004, CN-TL-005
- Added: 2026-10-09

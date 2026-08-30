# Issue #686 — eventParser / events.rs migrated-event alignment (tracking)

Acceptance-track issue covering Issues 31, 93, 110, 111, 115:
- `migrated` event (`from_version`, `to_version`)
- `rcv_exe` event (`old_admin`, `new_admin`)
- `adm_set` event (`new_admin`, `nonce`)

Care: ensure `sdk/src/eventParser.ts` decoders match the contract events in
`contracts/rwa-token/src/events.rs`, and add a unit test per decoder plus one
integration-level test.

Documentation-only scope note; implementation/tests to follow.

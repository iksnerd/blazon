The MCP tools no longer show example token paths that a brand may not have, and
`list_tokens`, `get_token` and `can_use` now answer an unknown path or group with
"did you mean" and the nearest real paths, the way `get_rules` already did. The
same applies to `blazon list`, `blazon get` and `blazon can`.

The fetch behind `init --from` and `drift <url>` also refuses the IPv4-translated
form `::ffff:0:a.b.c.d`, local-use NAT64 (`64:ff9b:1::/48`), Teredo
(`2001::/32`), the documentation ranges `2001:db8::/32`, `3fff::/20`,
`192.0.2.0/24`, `198.51.100.0/24` and `203.0.113.0/24`, SRv6 segment
identifiers (`5f00::/16`) and the 6to4 relay range `192.88.99.0/24`.

`blazon init --from` and `blazon drift <url>` fetch only public addresses. The
host is resolved first and a loopback, private, link-local (including the cloud
metadata address), unique-local or IPv4-mapped IPv6 address is refused, on
every redirect too (at most 5); the connection goes to the address that was
checked, so DNS rebinding cannot move it; and a page must be `text/html` and a
stylesheet `text/css`. No cookies or credentials are sent.

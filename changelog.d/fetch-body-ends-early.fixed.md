`blazon drift <url>` and `blazon init --from` fail with a named reason when a
compressed response (gzip, deflate or br) stops before its end or runs past the
time limit. Before, the read never finished and `blazon drift` exited 0 with no
output, which a CI gate took for "no drift". A refused response or a redirect
now closes its connection at once instead of downloading until the time limit.

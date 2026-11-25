`blazon outputs` and `get_outputs` call the generated files stale when only
`blazon.json` changed, and the dev server and the output folder checks treat it
as an input like any other.

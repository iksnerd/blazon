package hostprofile

import (
	"list"
	"strings"
)

// RFC 0010 draft 1 section 3 and 4, shape only. That a number tightens a core rule,
// that a role is behind the breaker and that the document equals the host's behaviour
// are the host's tests (section 5). This is a stricter check beside the published
// schemas/draft/host-profile.schema.json; it is not generated from it or into it.

#Name:    =~"^[a-z][a-z0-9_-]{0,31}$"
#Host:    =~"^[a-z0-9][a-z0-9_-]*$"
#Pointer: =~"^(/[^/]*)*$"
#Meaning: string & strings.MinRunes(1) & strings.MaxRunes(200)
#KindName: =~"^[a-z][a-z0-9-]*(\\.[a-z][a-z0-9-]*)*$" & strings.MaxRunes(64)

// RFC 0012 section 3: one version of a kind the host offers.
#KindVersion: {
	version!:     int & >=1
	schema!:      =~"^[^/:][^:]*$"
	digest!:      =~"^sha256:[0-9a-f]{64}$"
	description!: #Meaning
	roles?: [#Name, ...#Name] & list.UniqueItems()
	...
}

#Role: {
	name!: #Name
	exit_codes!: {
		"0"!: #Meaning
		"1"?: #Meaning
		"2"?: #Meaning
	}
	breaker?:            bool
	pinned?:             "always" | "by_rule"
	timeout_cap_ms?:     int & >=1
	stdout_limit_bytes?: int & >=1
	...
}

#Profile: {
	v!:             1
	host!:          #Host
	check_command!: string & strings.MinRunes(1)
	roles!: [#Role, ...#Role]
	adopts?: [..."0003" | "0004" | "0005" | "0006" | "0007" | "0008" | "0009" | "0012"] & list.UniqueItems()
	secret_fields?: [...#Pointer] & list.UniqueItems()
	secret_env_prefixes?: [...(string & strings.MinRunes(1))] & list.UniqueItems()
	subjects?: [string]: string
	request_cap_bytes?: int & >=1
	kinds?: [#KindName]: [#KindVersion, ...#KindVersion]

	// Section 4: "0007" requires "0003", and "0008" requires "0007". RFC 0012: "0012" requires kinds.
	if adopts != _|_ {
		_adopted: {for a in adopts {(a): true}}
		if _adopted["0007"] != _|_ && _adopted["0003"] == _|_ {
			_plansNeedActions: error("adopts 0007 (plans) without 0003 (actions)")
		}
		if _adopted["0008"] != _|_ && _adopted["0007"] == _|_ {
			_grantsNeedPlans: error("adopts 0008 (grants) without 0007 (plans)")
		}
		if _adopted["0012"] != _|_ && kinds == _|_ {
			_kindsNeedField: error("adopts 0012 (host data kinds) without kinds")
		}
	}
	...
}

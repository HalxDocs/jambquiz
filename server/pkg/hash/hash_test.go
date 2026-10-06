package hash

import "testing"

func TestRoundtrip(t *testing.T) {
	h, err := Password("supersecret1")
	if err != nil {
		t.Fatal(err)
	}
	if !Check(h, "supersecret1") {
		t.Fatal("valid password rejected")
	}
	if Check(h, "wrong") {
		t.Fatal("invalid password accepted")
	}
	if Check("", "supersecret1") {
		t.Fatal("empty hash accepted")
	}
}

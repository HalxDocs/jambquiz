package phones

import "testing"

func TestNormalize(t *testing.T) {
	cases := map[string]string{
		"08031234567":    "2348031234567",
		"+2348031234567": "2348031234567",
		"2348031234567":  "2348031234567",
		"8031234567":     "2348031234567",
		"0803 123 4567":  "2348031234567",
		"123":            "",
		"":               "",
	}
	for in, want := range cases {
		if got := Normalize(in); got != want {
			t.Errorf("Normalize(%q) = %q, want %q", in, got, want)
		}
	}
}

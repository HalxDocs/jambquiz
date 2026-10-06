package phones

import "regexp"

var nonDigits = regexp.MustCompile(`\D`)

// Normalize converts NG phone variants to canonical 234... form.
// Returns "" when invalid (10-14 digits after cleanup).
func Normalize(p string) string {
	s := nonDigits.ReplaceAllString(p, "")
	if s == "" {
		return ""
	}
	if s[0] == '0' {
		s = "234" + s[1:]
	} else if len(s) == 10 && (s[0] == '7' || s[0] == '8' || s[0] == '9') {
		s = "234" + s
	}
	if len(s) < 10 || len(s) > 14 {
		return ""
	}
	return s
}

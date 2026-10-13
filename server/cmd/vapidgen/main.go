// Command vapidgen prints a fresh VAPID keypair for web push.
package main

import (
	"fmt"

	webpush "github.com/SherClockHolmes/webpush-go"
)

func main() {
	pub, priv, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		panic(err)
	}
	fmt.Println("PUBLIC:", pub)
	fmt.Println("PRIVATE:", priv)
}

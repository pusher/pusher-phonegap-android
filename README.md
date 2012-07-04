# Pusher PhoneGap

This is a sample project that demonstrates how to use the [Pusher JavaScript library]() within PhoneGap.

## Getting started

**TODO**

## Native WebSocket support
Previous solutions of using Pusher within PhoneGap have resorted to falling back to a Flash connection. This sample removes that need by using a slightly modified version of [animesh kumar's](http://anismiles.wordpress.com/) library [websocket-android-phonegap](https://github.com/anismiles/websocket-android-phonegap). You can read a blog post about the library [here](http://anismiles.wordpress.com/2011/02/03/websocket-support-in-android%E2%80%99s-phonegap-apps/).

This means that a bridge is created between JavaScript and the Java runtime and a WebSocket proxy is added. It does however mean that a WebSocket connection to Pusher will be created from the PhoneGap wrapper.

## Development notes

### Android 2.3 Emulator Crashes

There is a [known bug](http://code.google.com/p/android/issues/detail?id=12987) with the Javascript to Java Bridge in 2.3 emulators which means the application crashes. This bug has been open for a **long time** so it's best to use another version of Android with the emulator for development.

### WebSocket.java implements Draft 75 and 76 only

The WebSocket.java class does have some Pusher-specific modifications but they were not to the protocol implementation, which was last updated 11 months ago.

Ideally the WebSocket implementation would be updated to use <https://github.com/rbaier/weberknecht> which is the most maintained Java WebSocket client library that I know of.
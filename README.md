# Pusher PhoneGap for Android

This is a sample project that demonstrates how to use the [Pusher JavaScript library](https://github.com/pusher/pusher-js) within PhoneGap on Android.

## Changelog

* **2.0-beta.1** - Removed Java WebSocket wrapper as pusher-js 2.* now provides a HTTP-based fallback. Awaiting 2.0.5 full release before moving from beta.
* **1.0** - Used Java WebSocket wrapper with pusher-js 1.* to provide WebSocket support

## Prerequisites

See [step 2 of the Getting Started with Android guide](http://docs.phonegap.com/en/1.9.0/guide_getting-started_android_index.md.html#Getting%20Started%20with%20Android) from the PhoneGap site.

## Getting started

1. `git clone git@github.com:pusher/pusher-phonegap-android.git` (this repo).
2. `cd pusher-phonegap-android`
3. See **Prerequisites** above. **Don't move on to step 3** in the PhoneGap guide.
4. Open Eclipse
5. In Eclipse:
   1. Eclipse menu: *File -> Import*
   2. Import Dialog: *General -> Existing Projects into Workspace*
   3. Select the **pusher-phonegap-android** folder. Click *Finish*.
6. At this point you may get a few errors. To resolve
   1. Right click on the *pusher-phonegap-android* project and select *Properties*
   2. Select *Android* in the left menu
   3. Select a *Project Build Target*. I chose *Android 4.0.3*. If you don't have any targets then it's likely your Android SDK isn't linked in properly. You can add this within the project properties and *Java Build Path -> Libraries* and add from the location you downloaded and extracted the [Android SDK](http://developer.android.com/sdk/index.html) to.
7. When you've no errors you can run the sample application:
   1. Click the *Run* icon
   2. In the *Run As* dialog select *Android Application*.
   3. The emulator will launch.
   4. Switch to the *Debug Perspective* in Eclipse and look at the *LogCat* panel. You should see a tonne of information streaming in. Eventually you'll start to see Pusher related debug.
   5. The emulator will eventually load the sample application and you'll see:
      1. A connection status of *connected* which indicates that the application are connected to Pusher
      2. A subscription status of *subscribed* which indicates a channel has successfully been subscribed to.

**Note** *I've found emulators, like Eclipse, to be a bit temperamental. But, persevere and keep trying to run the application and eventually things will work as expected.*

## Project notes

### Links

* [Cordova/PhoneGap API docs](http://docs.phonegap.com/en/1.9.0/index.html)
* [Android SDK](http://developer.android.com/sdk/index.html)
* [Eclipse](http://www.eclipse.org/)

### Android 2.3 Emulator Crashes

There is a [known bug](http://code.google.com/p/android/issues/detail?id=12987) with the Javascript to Java Bridge in 2.3 emulators which means the application crashes. This bug has been open for a **long time** so it's best to use another version of Android with the emulator for development.

If you see an error and the information contains:

>  JNI WARNING: jarray 0x40629bb0 points to non-array object (Ljava/lang/String;)

Then that's this issue! Use a different version of Android with the emulator.
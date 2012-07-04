package com.pusher.phonegap;

import org.apache.cordova.DroidGap;

import com.strumsoft.websocket.phonegap.WebSocketFactory;

import android.os.Bundle;

public class PusherPhoneGap extends DroidGap {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        super.loadUrl("file:///android_asset/www/index.html");
        
        this.appView.addJavascriptInterface(new WebSocketFactory(appView), "WebSocketFactory");
    }  
}

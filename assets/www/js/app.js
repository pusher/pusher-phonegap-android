(function($) {

  var CONFIG = {
    PUSHER: {
      APP_KEY: '49e26cb8e9dde3dfc009'
    }
  };

  Pusher.log = function(msg) {
    if (window.console && window.console.log) {
      window.console.log(msg);
      $( '#debug_log' ).prepend( msg );
    }
  };

  document.addEventListener("deviceready", onDeviceReady, false);

  function onDeviceReady() {

    // Get device info
    var deviceInfo = 'Device Name: ' + device.name + '<br />' +
      'Device Cordova: ' + device.cordova + '<br />' +
      'Device Platform: ' + device.platform + '<br />' +
      'Device UUID: ' + device.uuid + '<br />' +
      'Device Version: ' + device.version + '<br />';

    $('#deviceProperties').html(deviceInfo)

    // Connect
    var pusher = new Pusher(CONFIG.PUSHER.APP_KEY);
    pusher.connection.bind('state_change', connectionStateChange);

    function connectionStateChange(state) {
      $('#connectionStatus').html(state.current);
    }

    // Subscribe
    var channel = pusher.subscribe('my-channel');
    channel.bind('pusher:subscription_succeeded', subscriptionSucceeded);

    function subscriptionSucceeded() {
      $('#subscriptionStatus').html('succeeded');
    }

    channel.bind('my-event', handleMyEvent);

    function handleMyEvent(data) {
      $('#debug_log').append('<pre>' + JSON.stringify(data, null, 2) + '</pre>');
    }

  }

})(jQuery);
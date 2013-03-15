/*!
 * Pusher JavaScript Library v2.0.0-pre
 * http://pusherapp.com/
 *
 * Copyright 2011, Pusher
 * Released under the MIT licence.
 */

;(function() {
  function Pusher(app_key, options) {
    var self = this;

    this.options = options || {};
    this.key = app_key;
    this.channels = new Pusher.Channels();
    this.global_emitter = new Pusher.EventsDispatcher();
    this.sessionID = Math.floor(Math.random() * 1000000000);

    checkAppKey(this.key);

    var getStrategy = function(options) {
      return Pusher.StrategyBuilder.build(
        Pusher.Util.extend(Pusher.getDefaultStrategy(), self.options, options)
      );
    };
    var getTimeline = function() {
      return new Pusher.Timeline(self.key, self.sessionID, {
        features: Pusher.Util.getClientFeatures(),
        params: self.options.timelineParams || {},
        limit: 25
      });
    };
    var getTimelineSender = function(timeline, options) {
      return new Pusher.TimelineSender(timeline, {
        encrypted: self.isEncrypted() || !!options.encrypted,
        host: Pusher.stats_host,
        path: "/timeline"
      });
    };

    this.connection = new Pusher.ConnectionManager(
      this.key,
      Pusher.Util.extend(
        { getStrategy: getStrategy,
          getTimeline: getTimeline,
          getTimelineSender: getTimelineSender,
          activityTimeout: Pusher.activity_timeout,
          pongTimeout: Pusher.pong_timeout,
          unavailableTimeout: Pusher.unavailable_timeout
        },
        this.options,
        { encrypted: this.isEncrypted() }
      )
    );

    this.connection.bind('connected', function() {
      self.subscribeAll();
    })
    this.connection.bind('message', function(params) {
      var internal = (params.event.indexOf('pusher_internal:') === 0);
      if (params.channel) {
        var channel = self.channel(params.channel);
        if (channel) {
          channel.emit(params.event, params.data);
        }
      }
      // Emit globaly [deprecated]
      if (!internal) self.global_emitter.emit(params.event, params.data);
    })
    this.connection.bind('disconnected', function() {
      self.channels.disconnect();
    })
    this.connection.bind('error', function(err) {
      Pusher.warn('Error', err);
    });

    Pusher.instances.push(this);

    if (Pusher.isReady) self.connect();
  }
  var prototype = Pusher.prototype;

  Pusher.instances = [];
  Pusher.isReady = false;

  // To receive log output provide a Pusher.log function, for example
  // Pusher.log = function(m){console.log(m)}
  Pusher.debug = function() {
    if (!Pusher.log) {
      return;
    }
    Pusher.log(Pusher.Util.stringify.apply(this, arguments));
  };

  Pusher.warn = function() {
    if (window.console && window.console.warn) {
      window.console.warn(Pusher.Util.stringify.apply(this, arguments));
    } else {
      if (!Pusher.log) {
        return;
      }
      Pusher.log(Pusher.Util.stringify.apply(this, arguments));
    }
  };

  Pusher.ready = function() {
    Pusher.isReady = true;
    for (var i = 0, l = Pusher.instances.length; i < l; i++) {
      Pusher.instances[i].connect();
    }
  };

  prototype.channel = function(name) {
    return this.channels.find(name);
  };

  prototype.connect = function() {
    this.connection.connect();
  };

  prototype.disconnect = function() {
    this.connection.disconnect();
  };

  prototype.bind = function(event_name, callback) {
    this.global_emitter.bind(event_name, callback);
    return this;
  };

  prototype.bind_all = function(callback) {
    this.global_emitter.bind_all(callback);
    return this;
  };

  prototype.subscribeAll = function() {
    var channelName;
    for (channelName in this.channels.channels) {
      if (this.channels.channels.hasOwnProperty(channelName)) {
        this.subscribe(channelName);
      }
    }
  };

  prototype.subscribe = function(channel_name) {
    var self = this;
    var channel = this.channels.add(channel_name, this);

    if (this.connection.state === 'connected') {
      channel.authorize(
        this.connection.socket_id,
        this.options,
        function(err, data) {
          if (err) {
            channel.emit('pusher:subscription_error', data);
          } else {
            self.send_event('pusher:subscribe', {
              channel: channel_name,
              auth: data.auth,
              channel_data: data.channel_data
            });
          }
        }
      );
    }
    return channel;
  };

  prototype.unsubscribe = function(channel_name) {
    this.channels.remove(channel_name);
    if (this.connection.state === 'connected') {
      this.send_event('pusher:unsubscribe', {
        channel: channel_name
      });
    }
  };

  prototype.send_event = function(event_name, data, channel) {
    return this.connection.send_event(event_name, data, channel);
  };

  prototype.isEncrypted = function() {
    if (Pusher.Util.getDocumentLocation().protocol === "https:") {
      return true;
    } else {
      return !!this.options.encrypted;
    }
  };

  function checkAppKey(key) {
    if (key === null || key === undefined) {
      Pusher.warn(
        'Warning', 'You must pass your app key when you instantiate Pusher.'
      );
    }
  }

  this.Pusher = Pusher;
}).call(this);

;(function() {
  Pusher.Util = {
    now: function() {
      if (Date.now) {
        return Date.now();
      } else {
        return new Date().valueOf();
      }
    },

    /** Merges multiple objects into the target argument.
     *
     * For properties that are plain Objects, performs a deep-merge. For the
     * rest it just copies the value of the property.
     *
     * To extend prototypes use it as following:
     *   Pusher.Util.extend(Target.prototype, Base.prototype)
     *
     * You can also use it to merge objects without altering them:
     *   Pusher.Util.extend({}, object1, object2)
     *
     * @param  {Object} target
     * @return {Object} the target argument
     */
    extend: function(target) {
      for (var i = 1; i < arguments.length; i++) {
        var extensions = arguments[i];
        for (var property in extensions) {
          if (extensions[property] && extensions[property].constructor &&
              extensions[property].constructor === Object) {
            target[property] = Pusher.Util.extend(
              target[property] || {}, extensions[property]
            );
          } else {
            target[property] = extensions[property];
          }
        }
      }
      return target;
    },

    stringify: function() {
      var m = ["Pusher"];
      for (var i = 0; i < arguments.length; i++) {
        if (typeof arguments[i] === "string") {
          m.push(arguments[i]);
        } else {
          if (window.JSON === undefined) {
            m.push(arguments[i].toString());
          } else {
            m.push(JSON.stringify(arguments[i]));
          }
        }
      }
      return m.join(" : ");
    },

    arrayIndexOf: function(array, item) { // MSIE doesn't have array.indexOf
      var nativeIndexOf = Array.prototype.indexOf;
      if (array === null) {
        return -1;
      }
      if (nativeIndexOf && array.indexOf === nativeIndexOf) {
        return array.indexOf(item);
      }
      for (var i = 0, l = array.length; i < l; i++) {
        if (array[i] === item) {
          return i;
        }
      }
      return -1;
    },

    keys: function(object) {
      var result = [];
      for (var key in object) {
        if (Object.prototype.hasOwnProperty.call(object, key)) {
          result.push(key);
        }
      }
      return result;
    },

    /** Applies a function f to all elements of an array.
     *
     * Function f gets 3 arguments passed:
     * - element from the array
     * - index of the element
     * - reference to the array
     *
     * @param {Array} array
     * @param {Function} f
     */
    apply: function(array, f) {
      for (var i = 0; i < array.length; i++) {
        f(array[i], i, array);
      }
    },

    /** Applies a function f to all properties of an object.
     *
     * Function f gets 3 arguments passed:
     * - element from the object
     * - key of the element
     * - reference to the object
     *
     * @param {Object} object
     * @param {Function} f
     */
    objectApply: function(object, f) {
      for (var key in object) {
        if (Object.prototype.hasOwnProperty.call(object, key)) {
          f(object[key], key, object);
        }
      }
    },

    /** Maps all elements of the array and returns the result.
     *
     * Function f gets 4 arguments passed:
     * - element from the array
     * - index of the element
     * - reference to the source array
     * - reference to the destination array
     *
     * @param {Array} array
     * @param {Function} f
     */
    map: function(array, f) {
      var result = [];
      for (var i = 0; i < array.length; i++) {
        result.push(f(array[i], i, array, result));
      }
      return result;
    },

    /** Maps all elements of the object and returns the result.
     *
     * Function f gets 4 arguments passed:
     * - element from the object
     * - key of the element
     * - reference to the source object
     * - reference to the destination object
     *
     * @param {Object} object
     * @param {Function} f
     */
    mapObject: function(object, f) {
      var result = {};
      for (var key in object) {
        if (Object.prototype.hasOwnProperty.call(object, key)) {
          result[key] = f(object[key]);
        }
      }
      return result;
    },

    /** Filters elements of the array using a test function.
     *
     * Function test gets 4 arguments passed:
     * - element from the array
     * - index of the element
     * - reference to the source array
     * - reference to the destination array
     *
     * @param {Array} array
     * @param {Function} f
     */
    filter: function(array, test) {
      test = test || function(value) { return !!value; };

      var result = [];
      for (var i = 0; i < array.length; i++) {
        if (test(array[i], i, array, result)) {
          result.push(array[i]);
        }
      }
      return result;
    },

    /** Filters properties of the object using a test function.
     *
     * Function test gets 4 arguments passed:
     * - element from the object
     * - key of the element
     * - reference to the source object
     * - reference to the destination object
     *
     * @param {Object} object
     * @param {Function} f
     */
    filterObject: function(object, test) {
      test = test || function(value) { return !!value; };

      var result = {};
      for (var key in object) {
        if (Object.prototype.hasOwnProperty.call(object, key)) {
          if (test(object[key], key, object, result)) {
            result[key] = object[key];
          }
        }
      }
      return result;
    },

    /** Flattens an object into a two-dimensional array.
     *
     * @param  {Object} object
     * @return {Array} resulting array of [key, value] pairs
     */
    flatten: function(object) {
      var result = [];
      for (var key in object) {
        if (Object.prototype.hasOwnProperty.call(object, key)) {
          result.push([key, object[key]]);
        }
      }
      return result;
    },

    /** Checks whether any element of the array passes the test.
     *
     * Function test gets 3 arguments passed:
     * - element from the array
     * - index of the element
     * - reference to the source array
     *
     * @param {Array} array
     * @param {Function} f
     */
    any: function(array, test) {
      for (var i = 0; i < array.length; i++) {
        if (test(array[i], i, array)) {
          return true;
        }
      }
      return false;
    },

    /** Checks whether all elements of the array pass the test.
     *
     * Function test gets 3 arguments passed:
     * - element from the array
     * - index of the element
     * - reference to the source array
     *
     * @param {Array} array
     * @param {Function} f
     */
    all: function(array, test) {
      for (var i = 0; i < array.length; i++) {
        if (!test(array[i], i, array)) {
          return false;
        }
      }
      return true;
    },

    /** Builds a function that will proxy a method call to its first argument.
     *
     * Allows partial application of arguments, so additional arguments are
     * prepended to the argument list.
     *
     * @param  {String} name method name
     * @return {Function} proxy function
     */
    method: function(name) {
      var boundArguments = Array.prototype.slice.call(arguments, 1);
      return function(object) {
        return object[name].apply(object, boundArguments.concat(arguments));
      };
    },

    getDocumentLocation: function() {
      return document.location;
    },

    getClientFeatures: function() {
      return Pusher.Util.keys(
        Pusher.Util.filterObject(
          { "ws": Pusher.WSTransport, "flash": Pusher.FlashTransport },
          function (t) { return t.isSupported(); }
        )
      );
    }
  };
}).call(this);

;(function() {
  Pusher.VERSION = '2.0.0-pre';

  // WS connection parameters
  Pusher.host = 'ws.pusherapp.com';
  Pusher.ws_port = 80;
  Pusher.wss_port = 443;
  // SockJS fallback parameters
  Pusher.sockjs_host = 'sockjs.pusher.com';
  Pusher.sockjs_http_port = 80;
  Pusher.sockjs_https_port = 443;
  Pusher.sockjs_path = "/pusher";
  // Stats
  Pusher.stats_host = 'stats.pusher.com';
  // Other settings
  Pusher.channel_auth_endpoint = '/pusher/auth';
  Pusher.cdn_http = 'http://js.pusher.com';
  Pusher.cdn_https = 'https://d3dy5gmtp8yhk7.cloudfront.net';
  Pusher.dependency_suffix = '';
  Pusher.channel_auth_transport = 'ajax';
  Pusher.activity_timeout = 120000;
  Pusher.pong_timeout = 30000;
  Pusher.unavailable_timeout = 10000;

  Pusher.getDefaultStrategy = function() {
    return {
      type: "first_supported",
      host: Pusher.host,
      unencryptedPort: Pusher.ws_port,
      encryptedPort: Pusher.wss_port,
      loop: true,
      timeout: 15000,
      timeoutLimit: 60000,
      children: [
        { type: "first_supported",
          children: [
            { type: "all_supported",
              children: [
                { type: "first_supported",
                  children: [
                    { type: "sequential",
                      children: [{ type: "transport", transport: "ws" }]
                    },
                    { type: "sequential",
                      children: [{ type: "transport", transport: "flash" }]
                    }
                  ]
                },
                { type: "delayed",
                  delay: 2000,
                  child: {
                    type: "sequential",
                    children: [{
                      type: "transport",
                      transport: "sockjs",
                      host: Pusher.sockjs_host,
                      unencryptedPort: Pusher.sockjs_http_port,
                      encryptedPort: Pusher.sockjs_https_port
                    }]
                  }
                }
              ]
            },
            { type: "sequential",
              children: [{
                type: "transport",
                transport: "sockjs",
                host: Pusher.sockjs_host,
                unencryptedPort: Pusher.sockjs_http_port,
                encryptedPort: Pusher.sockjs_https_port
              }]
            }
          ]
        }
      ]
    };
  };
}).call(this);

;(function() {
  function buildExceptionClass(name) {
    var klass = function(message) {
      Error.call(this, message);
      this.name = name;
    };
    Pusher.Util.extend(klass.prototype, Error.prototype);

    return klass;
  }

  /** Error classes used throughout pusher-js library. */
  Pusher.Errors = {
    UnsupportedTransport: buildExceptionClass("UnsupportedTransport"),
    UnsupportedStrategy: buildExceptionClass("UnsupportedStrategy"),
    TransportClosed: buildExceptionClass("TransportClosed")
  };
}).call(this);

;(function() {
/* Abstract event binding
Example:

    var MyEventEmitter = function(){};
    MyEventEmitter.prototype = new Pusher.EventsDispatcher;

    var emitter = new MyEventEmitter();

    // Bind to single event
    emitter.bind('foo_event', function(data){ alert(data)} );

    // Bind to all
    emitter.bind_all(function(eventName, data){ alert(data) });

--------------------------------------------------------*/

  function CallbackRegistry() {
    this._callbacks = {};
  };

  CallbackRegistry.prototype.get = function(eventName) {
    return this._callbacks[this._prefix(eventName)];
  };

  CallbackRegistry.prototype.add = function(eventName, callback) {
    var prefixedEventName = this._prefix(eventName);
    this._callbacks[prefixedEventName] = this._callbacks[prefixedEventName] || [];
    this._callbacks[prefixedEventName].push(callback);
  };

  CallbackRegistry.prototype.remove = function(eventName, callback) {
    if(this.get(eventName)) {
      var index = Pusher.Util.arrayIndexOf(this.get(eventName), callback);
      this._callbacks[this._prefix(eventName)].splice(index, 1);
    }
  };

  CallbackRegistry.prototype._prefix = function(eventName) {
    return "_" + eventName;
  };


  function EventsDispatcher(failThrough) {
    this.callbacks = new CallbackRegistry();
    this.global_callbacks = [];
    // Run this function when dispatching an event when no callbacks defined
    this.failThrough = failThrough;
  }

  EventsDispatcher.prototype.bind = function(eventName, callback) {
    this.callbacks.add(eventName, callback);
    return this;// chainable
  };

  EventsDispatcher.prototype.unbind = function(eventName, callback) {
    this.callbacks.remove(eventName, callback);
    return this;
  };

  EventsDispatcher.prototype.emit = function(eventName, data) {
    // Global callbacks
    for (var i = 0; i < this.global_callbacks.length; i++) {
      this.global_callbacks[i](eventName, data);
    }

    // Event callbacks
    var callbacks = this.callbacks.get(eventName);
    if (callbacks) {
      for (var i = 0; i < callbacks.length; i++) {
        callbacks[i](data);
      }
    } else if (this.failThrough) {
      this.failThrough(eventName, data)
    }

    return this;
  };

  EventsDispatcher.prototype.bind_all = function(callback) {
    this.global_callbacks.push(callback);
    return this;
  };

  this.Pusher.EventsDispatcher = EventsDispatcher;
}).call(this);

;(function() {
  /** Handles loading dependency files.
   *
   * Options:
   * - cdn_http - url to HTTP CND
   * - cdn_https - url to HTTPS CDN
   * - version - version of pusher-js
   * - suffix - suffix appended to all names of dependency files
   *
   * @param {Object} options
   */
  function DependencyLoader(options) {
    this.options = options;
    this.loading = {};
    this.loaded = {};
  }
  var prototype = DependencyLoader.prototype;

  /** Loads the dependency from CDN.
   *
   * @param  {String} name
   * @param  {Function} callback
   */
  prototype.load = function(name, callback) {
    var self = this;

    if (this.loaded[name]) {
      callback();
      return;
    }

    if (!this.loading[name]) {
      this.loading[name] = [];
    }
    this.loading[name].push(callback);
    if (this.loading[name].length > 1) {
      return;
    }

    var path = this.getRoot() + '/' + name + this.options.suffix + '.js';

    require(path, function() {
      for (var i = 0; i < self.loading[name].length; i++) {
        self.loading[name][i]();
      }
      delete self.loading[name];
      self.loaded[name] = true;
    });
  };

  /** Returns a root URL for pusher-js CDN.
   *
   * @returns {String}
   */
  prototype.getRoot = function() {
    var cdn;
    if (document.location.protocol === "http:") {
      cdn = this.options.cdn_http;
    } else {
      cdn = this.options.cdn_https;
    }
    return cdn + "/" + this.options.version;
  };

  function handleScriptLoaded(elem, callback) {
    if (document.addEventListener) {
      elem.addEventListener('load', callback, false);
    } else {
      elem.attachEvent('onreadystatechange', function () {
        if (elem.readyState == 'loaded' || elem.readyState == 'complete') {
          callback();
        }
      });
    }
  }

  function require(src, callback) {
    var head = document.getElementsByTagName('head')[0];
    var script = document.createElement('script');
    script.setAttribute('src', src);
    script.setAttribute("type","text/javascript");
    script.setAttribute('async', true);

    handleScriptLoaded(script, function() {
      // workaround for an Opera issue
      setTimeout(callback, 0);
    });

    head.appendChild(script);
  }

  Pusher.DependencyLoader = DependencyLoader;
}).call(this);

;(function() {
  Pusher.Dependencies = new Pusher.DependencyLoader({
    cdn_http: Pusher.cdn_http,
    cdn_https: Pusher.cdn_https,
    version: Pusher.VERSION,
    suffix: Pusher.dependency_suffix
  });

  // Support Firefox versions which prefix WebSocket
  if (!window.WebSocket && window.MozWebSocket) {
    window.WebSocket = window.MozWebSocket;
  }

  function initialize() {
    Pusher.ready();
  }

  // Allows calling a function when the document body is available
   function onDocumentBody(callback) {
    if (document.body) {
      callback();
    } else {
      setTimeout(function() {
        onDocumentBody(callback);
      }, 0);
    }
  }

  function initializeOnDocumentBody() {
    onDocumentBody(initialize);
  }

  if (!window.JSON) {
    Pusher.Dependencies.load("json2", initializeOnDocumentBody);
  } else {
    initializeOnDocumentBody();
  }
})();

(function() {

  var Base64 = {
    encode: function (s) {
      return btoa(utob(s));
    }
  };

  var fromCharCode = String.fromCharCode;

  var b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var b64tab = {};

  for (var i = 0, l = b64chars.length; i < l; i++) {
    b64tab[b64chars.charAt(i)] = i;
  }

  var cb_utob = function(c) {
    var cc = c.charCodeAt(0);
    return cc < 0x80 ? c
        : cc < 0x800 ? fromCharCode(0xc0 | (cc >>> 6)) +
                       fromCharCode(0x80 | (cc & 0x3f))
        : fromCharCode(0xe0 | ((cc >>> 12) & 0x0f)) +
          fromCharCode(0x80 | ((cc >>>  6) & 0x3f)) +
          fromCharCode(0x80 | ( cc         & 0x3f));
  };

  var utob = function(u) {
    return u.replace(/[^\x00-\x7F]/g, cb_utob);
  };

  var cb_encode = function(ccc) {
    var padlen = [0, 2, 1][ccc.length % 3];
    var ord = ccc.charCodeAt(0) << 16
      | ((ccc.length > 1 ? ccc.charCodeAt(1) : 0) << 8)
      | ((ccc.length > 2 ? ccc.charCodeAt(2) : 0));
    var chars = [
      b64chars.charAt( ord >>> 18),
      b64chars.charAt((ord >>> 12) & 63),
      padlen >= 2 ? '=' : b64chars.charAt((ord >>> 6) & 63),
      padlen >= 1 ? '=' : b64chars.charAt(ord & 63)
    ];
    return chars.join('');
  };

  var btoa = window.btoa || function(b) {
    return b.replace(/[\s\S]{1,3}/g, cb_encode);
  };

  Pusher.Base64 = Base64;

}).call(this);

(function() {

  function JSONPRequest(options) {
    this.options = options;
  }

  JSONPRequest.send = function(options, callback) {
    var request = new Pusher.JSONPRequest({
      url: options.url,
      receiver: options.receiverName,
      tagPrefix: options.tagPrefix
    });
    var id = options.receiver.register(function(error, result) {
      request.cleanup();
      callback(error, result);
    });

    return request.send(id, options.data, function(error) {
      var callback = options.receiver.unregister(id);
      if (callback) {
        callback(error);
      }
    });
  };

  var prototype = JSONPRequest.prototype;

  prototype.send = function(id, data, callback) {
    if (this.script) {
      return false;
    }

    var tagPrefix = this.options.tagPrefix || "_pusher_jsonp_";

    var params = Pusher.Util.extend(
      {}, data, { receiver: this.options.receiver }
    );
    var query = Pusher.Util.map(
      Pusher.Util.flatten(
        encodeData(
          Pusher.Util.filterObject(params, function(value) {
            return value !== undefined;
          })
        )
      ),
      Pusher.Util.method("join", "=")
    ).join("&");

    this.script = document.createElement("script");
    this.script.id = tagPrefix + id;
    this.script.src = this.options.url + "/" + id + "?" + query;
    this.script.type = "text/javascript";
    this.script.charset = "UTF-8";
    this.script.onerror = this.script.onload = callback;

    // Opera<11.6 hack for missing onerror callback
    if (this.script.async === undefined && document.attachEvent) {
      if (/opera/i.test(navigator.userAgent)) {
        var receiverName = this.options.receiver || "Pusher.JSONP.receive";
        this.errorScript = document.createElement("script");
        this.errorScript.text = receiverName + "(" + id + ", true);";
        this.script.async = this.errorScript.async = false;
      }
    }

    var self = this;
    this.script.onreadystatechange = function() {
      if (self.script && /loaded|complete/.test(self.script.readyState)) {
        callback(true);
      }
    };

    var head = document.getElementsByTagName('head')[0];
    head.insertBefore(this.script, head.firstChild);
    if (this.errorScript) {
      head.insertBefore(this.errorScript, this.script.nextSibling);
    }

    return true;
  };

  prototype.cleanup = function() {
    if (this.script && this.script.parentNode) {
      this.script.parentNode.removeChild(this.script);
      this.script = null;
    }
    if (this.errorScript && this.errorScript.parentNode) {
      this.errorScript.parentNode.removeChild(this.errorScript);
      this.errorScript = null;
    }
  };

  function encodeData(data) {
    return Pusher.Util.mapObject(data, function(value) {
      if (typeof value === "object") {
        value = JSON.stringify(value);
      }
      return encodeURIComponent(Pusher.Base64.encode(value.toString()));
    });
  }

  Pusher.JSONPRequest = JSONPRequest;

}).call(this);

(function() {

  function JSONPReceiver() {
    this.lastId = 0;
    this.callbacks = {};
  }

  var prototype = JSONPReceiver.prototype;

  prototype.register = function(callback) {
    this.lastId++;
    var id = this.lastId;
    this.callbacks[id] = callback;
    return id;
  };

  prototype.unregister = function(id) {
    if (this.callbacks[id]) {
      var callback = this.callbacks[id];
      delete this.callbacks[id];
      return callback;
    } else {
      return null;
    }
  };

  prototype.receive = function(id, error, data) {
    var callback = this.unregister(id);
    if (callback) {
      callback(error, data);
    }
  };

  Pusher.JSONPReceiver = JSONPReceiver;
  Pusher.JSONP = new JSONPReceiver();

}).call(this);

(function() {
  function Timeline(key, session, options) {
    this.key = key;
    this.session = session;
    this.events = [];
    this.options = options || {};
    this.sent = 0;
  }
  var prototype = Timeline.prototype;

  prototype.push = function(event) {
    this.events.push(
      Pusher.Util.extend({}, event, { timestamp: Pusher.Util.now() })
    );
    if (this.options.limit && this.events.length > this.options.limit) {
      this.events.shift();
    }
  };

  prototype.isEmpty = function() {
    return this.events.length === 0;
  };

  prototype.send = function(sendJSONP, callback) {
    var self = this;

    var data = {};
    if (this.sent === 0) {
      data = Pusher.Util.extend({
        key: this.key,
        features: this.options.features,
        version: this.options.version
      }, this.options.params || {});
    }
    data.session = this.session;
    data.timeline = this.events;
    data = Pusher.Util.filterObject(data, function(v) {
      return v !== undefined;
    });

    this.events = [];
    sendJSONP(data, function(error, result) {
      if (!error) {
        self.sent++;
      }
      callback(error, result);
    });

    return true;
  };

  Pusher.Timeline = Timeline;
}).call(this);

(function() {
  function TimelineSender(timeline, options) {
    this.timeline = timeline;
    this.options = options || {};
  }
  var prototype = TimelineSender.prototype;

  prototype.send = function(callback) {
    if (this.timeline.isEmpty()) {
      return;
    }

    var options = this.options;
    var scheme = "http" + (this.isEncrypted() ? "s" : "") + "://";

    var sendJSONP = function(data, callback) {
      return Pusher.JSONPRequest.send({
        data: data,
        url: scheme + options.host + options.path,
        receiver: Pusher.JSONP
      }, callback);
    };
    this.timeline.send(sendJSONP, callback);
  };

  prototype.isEncrypted = function() {
    return !!this.options.encrypted;
  };

  Pusher.TimelineSender = TimelineSender;
}).call(this);

;(function() {
  /** Base class for all non-transport strategies.
   *
   * @param {Array} substrategies list of children strategies
   */
  function MultiStrategy(strategies, options) {
    this.strategies = strategies;
    this.options = options || {};
  }
  var prototype = MultiStrategy.prototype;

  MultiStrategy.filterUnsupported = function(strategies) {
    return Pusher.Util.filter(strategies, Pusher.Util.method("isSupported"));
  };

  /** Returns whether there are any supported substrategies.
   *
   * @returns {Boolean}
   */
  prototype.isSupported = function() {
    return Pusher.Util.any(this.strategies, Pusher.Util.method("isSupported"));
  };

  /** Returns an object with strategy's options
   *
   * @returns {Object}
   */
  prototype.getOptions = function() {
    return this.options;
  };

  Pusher.MultiStrategy = MultiStrategy;
}).call(this);

;(function() {
  Pusher.ParallelStrategy = {
    /** Connects to all strategies in parallel.
     *
     * Callback builder should be a function that takes two arguments: index
     * and a list of runners. It should return another function that will be
     * passed to the substrategy with given index. Runners can be aborted using
     * abortRunner(s) functions from this class.
     *
     * @param  {Array} strategies
     * @param  {Function} callbackBuilder
     * @return {Object} strategy runner
     */
    connect: function(strategies, callbackBuilder) {
      var runners = Pusher.Util.map(strategies, function(strategy, i, _, rs) {
        return strategy.connect(callbackBuilder(i, rs));
      });
      return {
        abort: function() {
          Pusher.ParallelStrategy.abortRunners(runners);
        }
      };
    },

    /** Checks whether all runners have failed.
     *
     * @param  {Array} runners
     * @return {Boolean}
     */
    allRunnersFailed: function(runners) {
      return Pusher.Util.all(runners, function(runner) {
        return !!runner.error;
      });
    },

    /** Aborts a single working runner.
     *
     * @param  {Object} runner
     */
    abortRunner: function(runner) {
      if (!runner.error && !runner.aborted) {
        runner.abort();
        runner.aborted = true;
      }
    },

    /** Aborts all working runners.
     *
     * @param  {Array} runners
     */
    abortRunners: function(runners) {
      Pusher.Util.apply(runners, Pusher.ParallelStrategy.abortRunner);
    }
  };
}).call(this);

;(function() {
  /** Runs substrategy after specified delay.
   *
   * Options:
   * - delay - time in miliseconds to delay the substrategy attempt
   *
   * @param {Strategy} strategy
   * @param {Object} options
   */
  function DelayedStrategy(strategy, options) {
    Pusher.MultiStrategy.call(this, [strategy], { delay: options.delay });
  }
  var prototype = DelayedStrategy.prototype;

  Pusher.Util.extend(prototype, Pusher.MultiStrategy.prototype);

  prototype.name = "delayed";

  /** @see TransportStrategy.prototype.connect */
  prototype.connect = function(callback) {
    if (!this.isSupported()) {
      return null;
    }

    var self = this;
    var abort = function() {
      clearTimeout(timer);
      timer = null;
    };
    var timer = setTimeout(function() {
      if (timer === null) {
        // hack for misbehaving clearTimeout in IE < 9
        return;
      }
      timer = null;
      abort = self.strategies[0].connect(callback).abort;
    }, this.options.delay);

    return {
      abort: function() {
        abort();
      }
    };
  };

  Pusher.DelayedStrategy = DelayedStrategy;
}).call(this);

;(function() {
  /** Launches all substrategies at the same time and uses the first connected.
   *
   * After establishing the connection, aborts all substrategies so that no
   * other attempts are made later.
   *
   * @param {Array} strategies
   */
  function FirstConnectedStrategy(strategies) {
    Pusher.MultiStrategy.call(this, strategies);
  }
  var prototype = FirstConnectedStrategy.prototype;

  Pusher.Util.extend(prototype, Pusher.MultiStrategy.prototype);

  prototype.name = "first_connected";

  /** @see TransportStrategy.prototype.connect */
  prototype.connect = function(callback) {
    if (!this.isSupported()) {
      return null;
    }
    return Pusher.ParallelStrategy.connect(
      Pusher.MultiStrategy.filterUnsupported(this.strategies),
      function(i, runners) {
        return function(error, connection) {
          runners[i].error = error;
          if (error) {
            if (Pusher.ParallelStrategy.allRunnersFailed(runners)) {
              callback(true);
            }
            return;
          }
          Pusher.ParallelStrategy.abortRunners(runners);
          callback(null, connection);
        };
      }
    );
  };

  Pusher.FirstConnectedStrategy = FirstConnectedStrategy;
}).call(this);

;(function() {
  /** Launches all substrategies and emits prioritized connected transports.
   *
   * Substrategies passed as the only argument should be ordered starting from
   * the most preferred one and ending with the least prioritized. After
   * substrategy X connects, substrategies Y > X are aborted, since they are
   * considered worse. Substrategies Y <= X are not aborted and can still emit
   * new connections.
   *
   * @param {Array} substrategies
   */
  function BestConnectedEverStrategy(strategies) {
    Pusher.MultiStrategy.call(this, strategies);
  }
  var prototype = BestConnectedEverStrategy.prototype;

  Pusher.Util.extend(prototype, Pusher.MultiStrategy.prototype);

  prototype.name = "best_connected_ever";

  /** @see TransportStrategy.prototype.connect */
  prototype.connect = function(callback) {
    if (!this.isSupported()) {
      return null;
    }
    return Pusher.ParallelStrategy.connect(
      Pusher.MultiStrategy.filterUnsupported(this.strategies),
      function(i, runners) {
        return function(error, connection) {
          runners[i].error = error;
          if (error) {
            if (Pusher.ParallelStrategy.allRunnersFailed(runners)) {
              callback(true);
            }
            return;
          }
          for (var j = i + 1; j < runners.length; j++) {
            Pusher.ParallelStrategy.abortRunner(runners[j]);
          }
          callback(null, connection);
        };
      }
    );
  };

  Pusher.BestConnectedEverStrategy = BestConnectedEverStrategy;
}).call(this);

;(function() {
  /** Takes the first supported substrategy and uses it to establish connection.
   *
   * @param {Array} substrategies
   */
  function FirstSupportedStrategy(substrategies) {
    Pusher.FirstConnectedStrategy.call(
      this, Pusher.MultiStrategy.filterUnsupported(substrategies).slice(0, 1)
    );
  }
  var prototype = FirstSupportedStrategy.prototype;

  Pusher.Util.extend(prototype, Pusher.FirstConnectedStrategy.prototype);

  prototype.name = "first_supported";

  Pusher.FirstSupportedStrategy = FirstSupportedStrategy;
}).call(this);

;(function() {
  /** First connected strategy, but supported only when all substrategies are.
   *
   * @param {Array} substrategies
   */
  function AllSupportedStrategy(substrategies) {
    Pusher.FirstConnectedStrategy.call(this, substrategies);
  }
  var prototype = AllSupportedStrategy.prototype;

  Pusher.Util.extend(prototype, Pusher.FirstConnectedStrategy.prototype);

  prototype.name = "all_supported";

  /** Returns whether all of substrategies are supported.
   *
   * @returns {Boolean}
   */
  prototype.isSupported = function() {
    return Pusher.Util.all(this.strategies, Pusher.Util.method("isSupported"));
  };

  Pusher.AllSupportedStrategy = AllSupportedStrategy;
}).call(this);

;(function() {
  /** Loops through strategies with optional timeouts.
   *
   * Options:
   * - loop - whether it should loop through the substrategy list
   * - timeout - initial timeout for a single substrategy
   * - timeoutLimit - maximum timeout
   *
   * @param {Strategy} substrategy
   * @param {Object} options
   */
  function SequentialStrategy(strategies, options) {
    Pusher.MultiStrategy.call(this, strategies, {
      loop: options.loop,
      timeout: options.timeout,
      timeoutLimit: options.timeoutLimit
    });
  }
  var prototype = SequentialStrategy.prototype;

  Pusher.Util.extend(prototype, Pusher.MultiStrategy.prototype);

  prototype.name = "seq";

  /** @see TransportStrategy.prototype.connect */
  prototype.connect = function(callback) {
    var self = this;

    var strategies = Pusher.MultiStrategy.filterUnsupported(this.strategies);
    var current = 0;
    var timeout = this.options.timeout;
    var runner = null;

    var tryNextStrategy = function(error, connection) {
      if (connection) {
        callback(null, connection);
      } else {
        current = current + 1;
        if (self.options.loop) {
          current = current % strategies.length;
        }

        if (current < strategies.length) {
          if (timeout) {
            timeout = timeout * 2;
            if (self.options.timeoutLimit) {
              timeout = Math.min(timeout, self.options.timeoutLimit);
            }
          }
          runner = self.tryStrategy(
            strategies[current], timeout, tryNextStrategy
          );
        } else {
          callback(true);
        }
      }
    };

    runner = this.tryStrategy(strategies[current], timeout, tryNextStrategy);

    return {
      abort: function() {
        runner.abort();
      }
    };
  };

  /** @private */
  prototype.tryStrategy = function(strategy, timeoutLength, callback) {
    var timeout = null;
    var runner = null;

    runner = strategy.connect(function(error, connection) {
      if (error && timeout) {
        // advance to the next strategy after the timeout
        return;
      }
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      callback(error, connection);
    });

    if (timeoutLength > 0) {
      timeout = setTimeout(function() {
        if (timeout) {
          runner.abort();
          callback(true);
        }
      }, timeoutLength);
    }

    return {
      abort: function() {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        runner.abort();
      }
    };
  };

  Pusher.SequentialStrategy = SequentialStrategy;
}).call(this);

;(function() {
  /** Provides a strategy interface for transports.
   *
   * @param {Class} transport
   * @param {Object} options options to pass to the transport
   */
  function TransportStrategy(transport, options) {
    this.transport = transport;
    this.options = options || {};
  }
  var prototype = TransportStrategy.prototype;

  prototype.name = "transport";

  /** Returns whether the transport is supported in the browser.
   *
   * @returns {Boolean}
   */
  prototype.isSupported = function() {
    return this.transport.isSupported({
      disableFlash: !!this.options.disableFlash
    });
  };

  /** Returns an object with strategy's options
   *
   * @returns {Object}
   */
  prototype.getOptions = function() {
    return this.options;
  };

  /** Launches a connection attempt and returns a strategy runner.
   *
   * @param  {Function} callback
   * @return {Object} strategy runner
   */
  prototype.connect = function(callback) {
    var connection = this.transport.createConnection(
      this.options.key, this.options
    );

    var onInitialized = function() {
      connection.unbind("initialized", onInitialized);
      connection.connect();
    };
    var onOpen = function() {
      unbindListeners();
      callback(null, connection);
    };
    var onError = function(error) {
      unbindListeners();
      callback(error);
    };
    var onClosed = function() {
      unbindListeners();
      callback(new Pusher.Errors.TransportClosed(this.transport));
    };

    var unbindListeners = function() {
      connection.unbind("initialized", onInitialized);
      connection.unbind("open", onOpen);
      connection.unbind("error", onError);
      connection.unbind("closed", onClosed);
    };

    connection.bind("initialized", onInitialized);
    connection.bind("open", onOpen);
    connection.bind("error", onError);
    connection.bind("closed", onClosed);

    // connect will be called automatically after initialization
    connection.initialize();

    return {
      abort: function() {
        if (connection.state === "open") {
          return;
        }
        unbindListeners();
        connection.close();
      }
    };
  };

  Pusher.TransportStrategy = TransportStrategy;
}).call(this);

;(function() {
  /** Handles common logic for all transports.
   *
   * Transport is a low-level connection object that wraps a connection method
   * and exposes a simple evented interface for the connection state and
   * messaging. It does not implement Pusher-specific WebSocket protocol.
   *
   * Additionally, it fetches resources needed for transport to work and exposes
   * an interface for querying transport support and its features.
   *
   * This is an abstract class, please do not instantiate it.
   *
   * States:
   * - new - initial state after constructing the object
   * - initializing - during initialization phase, usually fetching resources
   * - intialized - ready to establish a connection
   * - connection - when connection is being established
   * - open - when connection ready to be used
   * - closed - after connection was closed be either side
   *
   * Emits:
   * - error - after the connection raised an error
   *
   * Options:
   * - encrypted - whether connection should use ssl
   * - entryptedPort - port to connect to when encrypted
   * - unencryptedPort - port to connect to when not encrypted
   * - host - hostname to connect to
   *
   * @param {String} key application key
   * @param {Object} options
   */
  function AbstractTransport(key, options) {
    Pusher.EventsDispatcher.call(this);

    this.key = key;
    this.options = options;
    this.state = "new";
    this.timeline = options.timeline;
  }
  var prototype = AbstractTransport.prototype;

  Pusher.Util.extend(prototype, Pusher.EventsDispatcher.prototype);

  /** Checks whether the transport is supported in the browser.
   *
   * @returns {Boolean}
   */
  AbstractTransport.isSupported = function() {
    return false;
  };

  /** Checks whether the transport handles ping/pong on itself.
   *
   * @return {Boolean}
   */
  prototype.supportsPing = function() {
    return false;
  };

  /** Initializes the transport.
   *
   * Fetches resources if needed and then transitions to initialized.
   */
  prototype.initialize = function() {
    this.changeState("initialized");
  };

  /** Tries to establish a connection.
   *
   * @returns {Boolean} false if transport is in invalid state
   */
  prototype.connect = function() {
    if (this.socket || this.state !== "initialized") {
      return false;
    }

    var url = this.getURL(this.key, this.options);

    this.socket = this.createSocket(url);
    this.bindListeners();

    Pusher.debug("Connecting", { transport: this.name, url: url });
    this.changeState("connecting");
    return true;
  };

  /** Closes the connection.
   *
   * @return {Boolean} true if there was a connection to close
   */
  prototype.close = function() {
    if (this.socket) {
      this.socket.close();
      return true;
    } else {
      return false;
    }
  };

  /** Sends data over the open connection.
   *
   * @param {String} data
   * @return {Boolean} true only when in the "open" state
   */
  prototype.send = function(data) {
    if (this.state === "open") {
      // Workaround for MobileSafari bug (see https://gist.github.com/2052006)
      var self = this;
      setTimeout(function() {
        self.socket.send(data);
      }, 0);
      return true;
    } else {
      return false;
    }
  };

  /** @protected */
  prototype.onOpen = function() {
    this.changeState("open");
    this.socket.onopen = undefined;
  };

  /** @protected */
  prototype.onError = function(error) {
    this.emit("error", { type: 'WebSocketError', error: error });
    this.log({
      error: Pusher.Util.filterObject(error, function(value) {
        return (typeof value !== "object" && typeof value !== "function");
      })
    });
  };

  /** @protected */
  prototype.onClose = function() {
    this.changeState("closed");
    this.socket = undefined;
  };

  /** @protected */
  prototype.onMessage = function(message) {
    this.emit("message", message);
  };

  /** @protected */
  prototype.bindListeners = function() {
    var self = this;

    this.socket.onopen = function() { self.onOpen(); };
    this.socket.onerror = function(error) { self.onError(error); };
    this.socket.onclose = function() { self.onClose(); };
    this.socket.onmessage = function(message) { self.onMessage(message); };
  };

  /** @protected */
  prototype.createSocket = function(url) {
    return null;
  };

  /** @protected */
  prototype.getScheme = function() {
    return this.options.encrypted ? "wss" : "ws";
  };

  /** @protected */
  prototype.getBaseURL = function() {
    var port;
    if (this.options.encrypted) {
      port = this.options.encryptedPort;
    } else {
      port = this.options.unencryptedPort;
    }

    return this.getScheme() + "://" + this.options.host + ':' + port;
  };

  /** @protected */
  prototype.getPath = function() {
    return "/app/" + this.key;
  };

  /** @protected */
  prototype.getQueryString = function() {
    return "?protocol=5&client=js&version=" + Pusher.VERSION;
  };

  /** @protected */
  prototype.getURL = function() {
    return this.getBaseURL() + this.getPath() + this.getQueryString();
  };

  /** @protected */
  prototype.changeState = function(state, params) {
    this.state = state;
    this.emit(state, params);
    this.log({ state: state, params: params });
  };

  /** @protected */
  prototype.log = function(message) {
    if (this.timeline) {
      this.timeline.push(Pusher.Util.extend({
        transport: this.name + (this.options.encrypted ? "s" : "")
      }, message));
    }
  };

  Pusher.AbstractTransport = AbstractTransport;
}).call(this);

;(function() {
  /** Transport using Flash to emulate WebSockets.
   *
   * @see AbstractTransport
   */
  function FlashTransport(key, options) {
    Pusher.AbstractTransport.call(this, key, options);
  }
  var prototype = FlashTransport.prototype;

  Pusher.Util.extend(prototype, Pusher.AbstractTransport.prototype);

  prototype.name = "flash";

  /** Creates a new instance of FlashTransport.
   *
   * @param  {String} key
   * @param  {Object} options
   * @return {FlashTransport}
   */
  FlashTransport.createConnection = function(key, options) {
    return new FlashTransport(key, options);
  };

  /** Checks whether Flash is supported in the browser.
   *
   * It is possible to disable flash by passing an envrionment object with the
   * disableFlash property set to true.
   *
   * @see AbstractTransport.isSupported
   * @param {Object} environment
   * @returns {Boolean}
   */
  FlashTransport.isSupported = function(environment) {
    if (environment && environment.disableFlash) {
      return false;
    }
    try {
      return !!(new ActiveXObject('ShockwaveFlash.ShockwaveFlash'));
    } catch (e) {
      return navigator.mimeTypes["application/x-shockwave-flash"] !== undefined;
    }
  };

  /** Fetches flashfallback dependency if needed.
   *
   * Sets WEB_SOCKET_SUPPRESS_CROSS_DOMAIN_SWF_ERROR to true (if not set before)
   * and WEB_SOCKET_SWF_LOCATION to Pusher's cdn before loading Flash resources.
   *
   * @see AbstractTransport.prototype.initialize
   */
  prototype.initialize = function() {
    var self = this;

    this.changeState("initializing");

    if (window.WEB_SOCKET_SUPPRESS_CROSS_DOMAIN_SWF_ERROR === undefined) {
      window.WEB_SOCKET_SUPPRESS_CROSS_DOMAIN_SWF_ERROR = true;
    }
    window.WEB_SOCKET_SWF_LOCATION = Pusher.Dependencies.getRoot() +
      "/WebSocketMain.swf";
    Pusher.Dependencies.load("flashfallback", function() {
      self.changeState("initialized");
    });
  };

  /** @protected */
  prototype.createSocket = function(url) {
    return new WebSocket(url);
  };

  /** @protected */
  prototype.getQueryString = function() {
    return Pusher.AbstractTransport.prototype.getQueryString.call(this) +
      "&flash=true";
  };

  Pusher.FlashTransport = FlashTransport;
}).call(this);

;(function() {
  /** Fallback transport using SockJS.
   *
   * @see AbstractTransport
   */
  function SockJSTransport(key, options) {
    Pusher.AbstractTransport.call(this, key, options);
  }
  var prototype = SockJSTransport.prototype;

  Pusher.Util.extend(prototype, Pusher.AbstractTransport.prototype);

  prototype.name = "sockjs";

  /** Creates a new instance of SockJSTransport.
   *
   * @param  {String} key
   * @param  {Object} options
   * @return {SockJSTransport}
   */
  SockJSTransport.createConnection = function(key, options) {
    return new SockJSTransport(key, options);
  };

  /** Assumes that SockJS is always supported.
   *
   * @returns {Boolean} always true
   */
  SockJSTransport.isSupported = function() {
    return true;
  };

  /** Fetches sockjs dependency if needed.
   *
   * @see AbstractTransport.prototype.initialize
   */
  prototype.initialize = function() {
    var self = this;

    this.changeState("initializing");
    Pusher.Dependencies.load("sockjs", function() {
      self.changeState("initialized");
    });
  };

  /** Always returns true, since SockJS handles ping on its own.
   *
   * @returns {Boolean} always true
   */
  prototype.supportsPing = function() {
    return true;
  };

  /** @protected */
  prototype.createSocket = function(url) {
    return new SockJS(url, { debug: true, protocols_whitelist: [ 'xhr-polling', 'xhr-streaming' ] } );
  };

  /** @protected */
  prototype.getScheme = function() {
    return this.options.encrypted ? "https" : "http";
  };

  /** @protected */
  prototype.getPath = function() {
    return "/pusher";
  };

  /** @protected */
  prototype.getQueryString = function() {
    return "";
  };

  /** Handles opening a SockJS connection to Pusher.
   *
   * Since SockJS does not handle custom paths, we send it immediately after
   * establishing the connection.
   *
   * @protected
   */
  prototype.onOpen = function() {
    this.socket.send(JSON.stringify({
      path: Pusher.AbstractTransport.prototype.getPath.call(this)
    }));
    this.changeState("open");
    this.socket.onopen = undefined;
  };

  Pusher.SockJSTransport = SockJSTransport;
}).call(this);

;(function() {
  /** WebSocket transport.
   *
   * @see AbstractTransport
   */
  function WSTransport(key, options) {
    Pusher.AbstractTransport.call(this, key, options);
  }
  var prototype = WSTransport.prototype;

  Pusher.Util.extend(prototype, Pusher.AbstractTransport.prototype);

  prototype.name = "ws";

  /** Creates a new instance of WSTransport.
   *
   * @param  {String} key
   * @param  {Object} options
   * @return {WSTransport}
   */
  WSTransport.createConnection = function(key, options) {
    return new WSTransport(key, options);
  };

  /** Checks whether the browser supports WebSockets in any form.
   *
   * @returns {Boolean} true if browser supports WebSockets
   */
  WSTransport.isSupported = function() {
    return window.WebSocket !== undefined || window.MozWebSocket !== undefined;
  };

  /** @protected */
  prototype.createSocket = function(url) {
    var constructor = window.WebSocket || window.MozWebSocket;
    return new constructor(url);
  };

  /** @protected */
  prototype.getQueryString = function() {
    return Pusher.AbstractTransport.prototype.getQueryString.call(this) +
      "&flash=false";
  };

  Pusher.WSTransport = WSTransport;
}).call(this);

;(function() {
  var StrategyBuilder = {
    /** Transforms a JSON scheme to a strategy tree.
     *
     * @param {Object} scheme JSON strategy scheme
     * @returns {Strategy} strategy tree that's represented by the scheme
     */
    build: function(scheme) {
      var builder = builders[scheme.type];

      if (!builder) {
        throw new Pusher.Errors.UnsupportedStrategy(scheme.type);
      }

      return builder(scheme);
    }
  };

  var transports = {
    ws: Pusher.WSTransport,
    flash: Pusher.FlashTransport,
    sockjs: Pusher.SockJSTransport
  };

  var builders = {
    transport: function(scheme) {
      var klass = transports[scheme.transport];
      if (!klass) {
        throw new Pusher.Errors.UnsupportedTransport(scheme.transport);
      }

      var options = filter(scheme, {"type": true, "transport": true});
      return new Pusher.TransportStrategy(klass, options);
    },

    delayed: function(scheme) {
      var options = filter(scheme, {"type": true, "child": true});

      return new Pusher.DelayedStrategy(
        StrategyBuilder.build(Pusher.Util.extend({}, options, scheme.child)),
        options
      );
    },

    sequential: function(scheme) {
      return buildWithSubstrategies(Pusher.SequentialStrategy, scheme);
    },

    first_supported: function(scheme) {
      return buildWithSubstrategies(Pusher.FirstSupportedStrategy, scheme);
    },

    all_supported: function(scheme) {
      return buildWithSubstrategies(Pusher.AllSupportedStrategy, scheme);
    },

    first_connected: function(scheme) {
      return buildWithSubstrategies(Pusher.FirstConnectedStrategy, scheme);
    },

    best_connected_ever: function(scheme) {
      return buildWithSubstrategies(Pusher.BestConnectedEverStrategy, scheme);
    }
  };

  function buildWithSubstrategies(constructor, scheme) {
    var options = filter(scheme, {"type": true, "children": true});
    var substrategies = [];

    for (var i = 0; i < scheme.children.length; i++) {
      substrategies.push(
        StrategyBuilder.build(
          Pusher.Util.extend({}, options, scheme.children[i])
        )
      );
    }

    return new constructor(substrategies, options);
  }

  function filter(object, filteredKeys) {
    var result = {};
    for (var key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        if (!filteredKeys[key]) {
          result[key] = object[key];
        }
      }
    }

    return result;
  }

  Pusher.StrategyBuilder = StrategyBuilder;
}).call(this);

;(function() {
  /**
   * Provides Pusher protocol interface for transports.
   *
   * Emits following events:
   * - connected - after establishing connection and receiving a socket id
   * - message - on received messages
   * - ping - on ping requests
   * - pong - on pong responses
   * - error - when the transport emits an error
   * - closed - after closing the transport
   * - ssl_only - after trying to connect without ssl to a ssl-only app
   * - retry - when closed connection should be retried immediately
   * - backoff - when closed connection should be retried with a delay
   * - refused - when closed connection should not be retried
   *
   * @param {AbstractTransport} transport
   */
  function ProtocolWrapper(transport) {
    Pusher.EventsDispatcher.call(this);
    this.transport = transport;
    this.bindListeners();
  }
  var prototype = ProtocolWrapper.prototype;

  Pusher.Util.extend(prototype, Pusher.EventsDispatcher.prototype);

  /** Returns whether used transport handles ping/pong by itself
   *
   * @returns {Boolean} true if ping is handled by the transport
   */
  prototype.supportsPing = function() {
    return this.transport.supportsPing();
  };

  /** Sends raw data.
   *
   * @param {String} data
   */
  prototype.send = function(data) {
    return this.transport.send(data);
  };

  /** Sends an event.
   *
   * @param {String} name
   * @param {String} data
   * @param {String} [channel]
   * @returns {Boolean} whether message was sent or not
   */
  prototype.send_event = function(name, data, channel) {
    var payload = {
      event: name,
      data: data
    };
    if (channel) {
      payload.channel = channel;
    }

    Pusher.debug('Event sent', payload);
    return this.send(JSON.stringify(payload));
  };

  /** Closes the transport.  */
  prototype.close = function() {
    this.transport.close();
  };

  /** @private */
  prototype.bindListeners = function() {
    var self = this;

    var onMessageOpen = function(message) {
      message = self.parseMessage(message);

      if (message !== undefined) {
        if (message.event === 'pusher:connection_established') {
          self.id = message.data.socket_id;
          self.transport.unbind("message", onMessageOpen);
          self.transport.bind("message", onMessageConnected);
          self.emit("connected", self.id);
        } else if (message.event === 'pusher:error') {
          self.handleCloseCode(message.data.code, message.data.message);
        }
      }
    };
    var onMessageConnected = function(message) {
      message = self.parseMessage(message);

      if (message !== undefined) {
        Pusher.debug('Event recd', message);

        switch (message.event) {
          case 'pusher:error':
            self.emit('error', { type: 'PusherError', data: message.data });
            break;
          case 'pusher:ping':
            self.emit("ping");
            break;
          case 'pusher:pong':
            self.emit("pong");
            break;
        }
        self.emit('message', message);
      }
    };
    var onError = function(error) {
      self.emit("error", { type: "WebSocketError", error: error });
    };
    var onClosed = function() {
      self.transport.unbind("message", onMessageOpen);
      self.transport.unbind("message", onMessageConnected);
      self.transport.unbind("error", onError);
      self.transport.unbind("closed", onClosed);
      self.transport = null;
      self.emit("closed");
    };

    this.transport.bind("message", onMessageOpen);
    this.transport.bind("error", onError);
    this.transport.bind("closed", onClosed);
  };

  /** @private */
  prototype.parseMessage = function(message) {
    try {
      var params = JSON.parse(message.data);

      if (typeof params.data === 'string') {
        try {
          params.data = JSON.parse(params.data);
        } catch (e) {
          if (!(e instanceof SyntaxError)) {
            throw e;
          }
        }
      }

      return params;
    } catch (e) {
      this.emit(
        'error', { type: 'MessageParseError', error: e, data: message.data}
      );
    }
  };

  /** @private */
  prototype.handleCloseCode = function(code, message) {
    this.emit(
      'error', { type: 'PusherError', data: { code: code, message: message } }
    );

    if (code === 4000) {
      this.emit("ssl_only");
    } else if (code < 4100) {
      this.emit("refused");
    } else if (code < 4200) {
      this.emit("backoff");
    } else if (code < 4300) {
      this.emit("retry");
    } else {
      // unknown error
      this.emit("refused");
    }
    this.transport.close();
  };

  Pusher.ProtocolWrapper = ProtocolWrapper;
}).call(this);

;(function() {
  /** Manages connection to Pusher.
   *
   * Uses a strategy (currently only default), timers and network availability
   * info to establish a connection and export its state. In case of failures,
   * manages reconnection attempts.
   *
   * Exports state changes as following events:
   * - "state_change", { previous: p, current: state }
   * - state
   *
   * States:
   * - initialized - initial state, never transitioned to
   * - connecting - connection is being established
   * - connected - connection has been fully established
   * - disconnected - on requested disconnection or before reconnecting
   * - unavailable - after connection timeout or when there's no network
   *
   * Options:
   * - unavailableTimeout - time to transition to unavailable state
   * - activityTimeout - time after which ping message should be sent
   * - pongTimeout - time for Pusher to respond with pong before reconnecting
   *
   * @param {String} key application key
   * @param {Object} options
   */
  function ConnectionManager(key, options) {
    Pusher.EventsDispatcher.call(this);

    this.key = key;
    this.options = options || {};
    this.state = "initialized";
    this.connection = null;
    this.encrypted = !!options.encrypted;
    this.timeline = this.options.getTimeline();

    var self = this;

    Pusher.Network.bind("online", function() {
      if (self.state === "unavailable") {
        self.connect();
      }
    });
    Pusher.Network.bind("offline", function() {
      if (self.shouldRetry()) {
        self.disconnect();
        self.updateState("unavailable");
      }
    });

    var sendTimeline = function() {
      if (self.timelineSender) {
        self.timelineSender.send(function() {});
      }
    };
    this.bind("connected", sendTimeline);
    setInterval(sendTimeline, 60000);
  }
  var prototype = ConnectionManager.prototype;

  Pusher.Util.extend(prototype, Pusher.EventsDispatcher.prototype);

  /** Establishes a connection to Pusher.
   *
   * Does nothing when connection is already established. See top-level doc
   * to find events emitted on connection attempts.
   */
  prototype.connect = function() {
    if (this.connection) {
      return;
    }
    if (this.state === "connecting") {
      return;
    }

    var strategy = this.options.getStrategy({
      key: this.key,
      timeline: this.timeline,
      encrypted: this.encrypted
    });

    if (!strategy.isSupported()) {
      this.updateState("failed");
      return;
    }
    if (Pusher.Network.isOnline() === false) {
      this.updateState("unavailable");
      return;
    }

    this.updateState("connecting");
    this.timelineSender = this.options.getTimelineSender(
      this.timeline,
      { encrypted: this.encrypted },
      this
    );

    var self = this;
    var callback = function(error, transport) {
      if (error) {
        self.runner = strategy.connect(callback);
      } else {
        // we don't support switching connections yet
        self.runner.abort();
        self.setConnection(self.wrapTransport(transport));
      }
    };
    this.runner = strategy.connect(callback);

    this.setUnavailableTimer();
  };

  /** Sends raw data.
   *
   * @param {String} data
   */
  prototype.send = function(data) {
    if (this.connection) {
      return this.connection.send(data);
    } else {
      return false;
    }
  };

  /** Sends an event.
   *
   * @param {String} name
   * @param {String} data
   * @param {String} [channel]
   * @returns {Boolean} whether message was sent or not
   */
  prototype.send_event = function(name, data, channel) {
    if (this.connection) {
      return this.connection.send_event(name, data, channel);
    } else {
      return false;
    }
  };

  /** Closes the connection. */
  prototype.disconnect = function() {
    if (this.runner) {
      this.runner.abort();
    }
    this.clearRetryTimer();
    this.clearUnavailableTimer();
    this.stopActivityCheck();
    this.updateState("disconnected");
    // we're in disconnected state, so closing will not cause reconnecting
    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }
  };

  /** @private */
  prototype.retryIn = function(delay) {
    var self = this;
    this.retryTimer = setTimeout(function() {
      if (self.retryTimer === null) {
        return;
      }
      self.retryTimer = null;
      self.disconnect();
      self.connect();
    }, delay || 0);
  };

  /** @private */
  prototype.clearRetryTimer = function() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  };

  /** @private */
  prototype.setUnavailableTimer = function() {
    var self = this;
    this.unavailableTimer = setTimeout(function() {
      if (!self.unavailableTimer) {
        return;
      }
      self.updateState("unavailable");
      self.unavailableTimer = null;
    }, this.options.unavailableTimeout);
  };

  /** @private */
  prototype.clearUnavailableTimer = function() {
    if (this.unavailableTimer) {
      clearTimeout(this.unavailableTimer);
      this.unavailableTimer = null;
    }
  };

  /** @private */
  prototype.resetActivityCheck = function() {
    this.stopActivityCheck();
    // send ping after inactivity
    if (!this.connection.supportsPing()) {
      var self = this;
      this.activityTimer = setTimeout(function() {
        self.send_event('pusher:ping', {});
        // wait for pong response
        self.activityTimer = setTimeout(function() {
          self.connection.close();
        }, (self.options.pongTimeout));
      }, (this.options.activityTimeout));
    }
  };

  /** @private */
  prototype.stopActivityCheck = function() {
    if (this.activityTimer) {
      clearTimeout(this.activityTimer);
      this.activityTimer = null;
    }
  };

  /** @private */
  prototype.setConnection = function(connection) {
    this.connection = connection;

    var self = this;
    var onConnected = function(id) {
      self.clearUnavailableTimer();
      self.socket_id = id;
      self.updateState("connected");
      self.resetActivityCheck();
    };
    var onMessage = function(message) {
      // includes pong messages from server
      self.resetActivityCheck();
      self.emit('message', message);
    };
    var onPing = function() {
      self.send_event('pusher:pong', {});
    };
    var onError = function(error) {
      // just emit error to user - socket will already be closed by browser
      self.emit("error", { type: "WebSocketError", error: error });
    };
    var onClosed = function() {
      connection.unbind("connected", onConnected);
      connection.unbind("message", onMessage);
      connection.unbind("ping", onPing);
      connection.unbind("error", onError);
      connection.unbind("closed", onClosed);
      self.connection = null;

      if (self.shouldRetry()) {
        self.retryIn(0);
      }
    };

    // handling close conditions
    var onSSLOnly = function() {
      self.encrypted = true;
      self.retryIn(0);
    };
    var onRefused = function() {
      self.disconnect();
    };
    var onBackoff = function() {
      self.retryIn(1000);
    };
    var onRetry = function() {
      self.retryIn(0);
    };

    connection.bind("connected", onConnected);
    connection.bind("message", onMessage);
    connection.bind("ping", onPing);
    connection.bind("error", onError);
    connection.bind("closed", onClosed);

    connection.bind("ssl_only", onSSLOnly);
    connection.bind("refused", onRefused);
    connection.bind("backoff", onBackoff);
    connection.bind("retry", onRetry);

    this.resetActivityCheck();
  };

  /** @private */
  prototype.updateState = function(newState, data) {
    var previousState = this.state;

    this.state = newState;
    // Only emit when the state changes
    if (previousState !== newState) {
      Pusher.debug('State changed', previousState + ' -> ' + newState);

      this.emit('state_change', { previous: previousState, current: newState });
      this.emit(newState, data);
    }
  };

  /** @private */
  prototype.shouldRetry = function() {
    return this.state === "connecting" || this.state === "connected";
  };

  /** @private */
  prototype.wrapTransport = function(transport) {
    return new Pusher.ProtocolWrapper(transport);
  };

  Pusher.ConnectionManager = ConnectionManager;
}).call(this);

;(function() {
  /** Really basic interface providing network availability info.
   *
   * Emits:
   * - online - when browser goes online
   * - offline - when browser goes offline
   */
  function NetInfo() {
    Pusher.EventsDispatcher.call(this);

    var self = this;
    // This is okay, as IE doesn't support this stuff anyway.
    if (window.addEventListener !== undefined) {
      window.addEventListener("online", function() {
        self.emit('online');
      }, false);
      window.addEventListener("offline", function() {
        self.emit('offline');
      }, false);
    }
  }
  Pusher.Util.extend(NetInfo.prototype, Pusher.EventsDispatcher.prototype);

  var prototype = NetInfo.prototype;

  /** Returns whether browser is online or not
   *
   * Offline means definitely offline (no connection to router).
   * Inverse does NOT mean definitely online (only currently supported in Safari
   * and even there only means the device has a connection to the router).
   *
   * @return {Boolean}
   */
  prototype.isOnline = function() {
    if (window.navigator.onLine === undefined) {
      return true;
    } else {
      return window.navigator.onLine;
    }
  };

  Pusher.NetInfo = NetInfo;
  Pusher.Network = new NetInfo();
}).call(this);

;(function() {
  Pusher.Channels = function() {
    this.channels = {};
  };

  Pusher.Channels.prototype = {
    add: function(channel_name, pusher) {
      var existing_channel = this.find(channel_name);
      if (!existing_channel) {
        var channel = Pusher.Channel.factory(channel_name, pusher);
        this.channels[channel_name] = channel;
        return channel;
      } else {
        return existing_channel;
      }
    },

    find: function(channel_name) {
      return this.channels[channel_name];
    },

    remove: function(channel_name) {
      delete this.channels[channel_name];
    },

    disconnect: function () {
      for(var channel_name in this.channels){
        this.channels[channel_name].disconnect()
      }
    }
  };

  Pusher.Channel = function(channel_name, pusher) {
    var self = this;
    Pusher.EventsDispatcher.call(this, function(event_name, event_data) {
      Pusher.debug('No callbacks on ' + channel_name + ' for ' + event_name);
    });

    this.pusher = pusher;
    this.name = channel_name;
    this.subscribed = false;

    this.bind('pusher_internal:subscription_succeeded', function(data) {
      self.onSubscriptionSucceeded(data);
    });
  };

  Pusher.Channel.prototype = {
    // inheritable constructor
    init: function() {},
    disconnect: function() {
      this.subscribed = false;
      this.emit("pusher_internal:disconnected");
    },

    onSubscriptionSucceeded: function(data) {
      this.subscribed = true;
      this.emit('pusher:subscription_succeeded');
    },

    authorize: function(socketId, options, callback){
      return callback(false, {}); // normal channels don't require auth
    },

    trigger: function(event, data) {
      return this.pusher.send_event(event, data, this.name);
    }
  };

  Pusher.Util.extend(Pusher.Channel.prototype, Pusher.EventsDispatcher.prototype);

  Pusher.Channel.PrivateChannel = {
    authorize: function(socketId, options, callback){
      var self = this;
      var authorizer = new Pusher.Channel.Authorizer(this, Pusher.channel_auth_transport, options);
      return authorizer.authorize(socketId, function(err, authData) {
        if(!err) {
          self.emit('pusher_internal:authorized', authData);
        }

        callback(err, authData);
      });
    }
  };

  Pusher.Channel.PresenceChannel = {
    init: function(){
      this.members = new Members(this); // leeches off channel events
    },

    onSubscriptionSucceeded: function(data) {
      this.subscribed = true;
      // We override this because we want the Members obj to be responsible for
      // emitting the pusher:subscription_succeeded.  It will do this after it has done its work.
    }
  };

  var Members = function(channel) {
    var self = this;

    var reset = function() {
      this._members_map = {};
      this.count = 0;
      this.me = null;
    };
    reset.call(this);

    channel.bind('pusher_internal:authorized', function(authorizedData) {
      var channelData = JSON.parse(authorizedData.channel_data);
      channel.bind("pusher_internal:subscription_succeeded", function(subscriptionData) {
        self._members_map = subscriptionData.presence.hash;
        self.count = subscriptionData.presence.count;
        self.me = self.get(channelData.user_id);
        channel.emit('pusher:subscription_succeeded', self);
      });
    });

    channel.bind('pusher_internal:member_added', function(data) {
      if(self.get(data.user_id) === null) { // only incr if user_id does not already exist
        self.count++;
      }

      self._members_map[data.user_id] = data.user_info;
      channel.emit('pusher:member_added', self.get(data.user_id));
    });

    channel.bind('pusher_internal:member_removed', function(data) {
      var member = self.get(data.user_id);
      if(member) {
        delete self._members_map[data.user_id];
        self.count--;
        channel.emit('pusher:member_removed', member);
      }
    });

    channel.bind('pusher_internal:disconnected', function() {
      reset.call(self);
    });
  };

  Members.prototype = {
    each: function(callback) {
      for(var i in this._members_map) {
        callback(this.get(i));
      }
    },

    get: function(user_id) {
      if (this._members_map.hasOwnProperty(user_id)) { // have heard of this user user_id
        return {
          id: user_id,
          info: this._members_map[user_id]
        }
      } else { // have never heard of this user
        return null;
      }
    }
  };

  Pusher.Channel.factory = function(channel_name, pusher){
    var channel = new Pusher.Channel(channel_name, pusher);
    if (channel_name.indexOf('private-') === 0) {
      Pusher.Util.extend(channel, Pusher.Channel.PrivateChannel);
    } else if (channel_name.indexOf('presence-') === 0) {
      Pusher.Util.extend(channel, Pusher.Channel.PrivateChannel);
      Pusher.Util.extend(channel, Pusher.Channel.PresenceChannel);
    };
    channel.init();
    return channel;
  };
}).call(this);
;(function() {
  Pusher.Channel.Authorizer = function(channel, type, options) {
    this.channel = channel;
    this.type = type;

    this.authOptions = (options || {}).auth || {};
  };

  Pusher.Channel.Authorizer.prototype = {
    composeQuery: function(socketId) {
      var query = '&socket_id=' + encodeURIComponent(socketId)
        + '&channel_name=' + encodeURIComponent(this.channel.name);

      for(var i in this.authOptions.params) {
        query += "&" + encodeURIComponent(i) + "=" + encodeURIComponent(this.authOptions.params[i]);
      }

      return query;
    },

    authorize: function(socketId, callback) {
      return Pusher.authorizers[this.type].call(this, socketId, callback);
    }
  };


  Pusher.auth_callbacks = {};
  Pusher.authorizers = {
    ajax: function(socketId, callback){
      var self = this, xhr;

      if (Pusher.XHR) {
        xhr = new Pusher.XHR();
      } else {
        xhr = (window.XMLHttpRequest ? new window.XMLHttpRequest() : new ActiveXObject("Microsoft.XMLHTTP"));
      }

      xhr.open("POST", Pusher.channel_auth_endpoint, true);

      // add request headers
      xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded")
      for(var headerName in this.authOptions.headers) {
        xhr.setRequestHeader(headerName, this.authOptions.headers[headerName]);
      }

      xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
          if (xhr.status == 200) {
            var data, parsed = false;

            try {
              data = JSON.parse(xhr.responseText);
              parsed = true;
            } catch (e) {
              callback(true, 'JSON returned from webapp was invalid, yet status code was 200. Data was: ' + xhr.responseText);
            }

            if (parsed) { // prevents double execution.
              callback(false, data);
            }
          } else {
            Pusher.warn("Couldn't get auth info from your webapp", xhr.status);
            callback(true, xhr.status);
          }
        }
      };

      xhr.send(this.composeQuery(socketId));
      return xhr;
    },

    jsonp: function(socketId, callback){
      if(this.authOptions.headers !== undefined) {
        Pusher.warn("Warn", "To send headers with the auth request, you must use AJAX, rather than JSONP.");
      }

      var script = document.createElement("script");
      // Hacked wrapper.
      Pusher.auth_callbacks[this.channel.name] = function(data) {
        callback(false, data);
      };

      var callback_name = "Pusher.auth_callbacks['" + this.channel.name + "']";
      script.src = Pusher.channel_auth_endpoint
        + '?callback='
        + encodeURIComponent(callback_name)
        + this.composeQuery(socketId);

      var head = document.getElementsByTagName("head")[0] || document.documentElement;
      head.insertBefore( script, head.firstChild );
    }
  };
}).call(this);
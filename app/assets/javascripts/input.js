var audio_analysers = [];
var volume = null;
var preview_volume = null;
var input = {
  request_media: function(opts) {
    if(opts.video && !opts.video.deviceId) {
      delete opts.video.deviceId;
    }
    return new Promise(function(res, rej) {
      navigator.mediaDevices.getUserMedia(opts).then(function(media) {
        res(media);
      }, function(err) {
        var updated = false;
        if(opts.video && opts.video.deviceId) {
          delete opts.video.deviceId;
          updated = true;
        }
        if(opts.audio && opts.audio.deviceId) {
          delete opts.audio.deviceId;
          updated = true;
        }
        if(updated) {
          navigator.mediaDevices.getUserMedia(opts).then(function(media) {
            res(media);
          }, function(err) {
            rej(err);
          });
        } else {
          rej(err);
        }
      });
    })
  },
  play_sound: function(url) {
    var sound = new Audio();
    sound.src = url;
    sound.oncanplay = function() {
      sound.play().then(null, function(e) {
        // NotAllowedError possibly
      });
    }  
  },
  track_audio: function(elem, track, user) {
    var res = null;
    if(!volume) {
      volume = document.querySelector('#volume_level');
      if(volume) {
        if(location.href.match(/localhost/)) {
          volume.style.display = 'block';
        } else {
          volume.style.display = 'none';
        }    
      }
    }
    preview_volume = document.querySelector('#no_preview .volume .bar');

    var new_list = [];
    audio_analysers.forEach(function(ana) {
      if(!ana.audio_element.parentNode || ana.stream.active == false) {
        console.log("OLD TRACK, STOPPING ANALYSIS");
        ana.release();
      } else {
        new_list.push(ana);
      }
    });
    audio_analysers = new_list;
    if(window.AudioContext || window.webkitAudioContext) { // if I'm the communicator, analyze, otherwise it should only add for communicator
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      var context = new AudioContext();
      var stream = user && user.remote_stream;
      if(!stream && track.mediaStreamTrack) {
        stream = new MediaStream();
        stream.addTrack(track.mediaStreamTrack);
      }
      if(context && user && stream) {
        var found = false;
        audio_analysers.forEach(function(ana) {
          if(ana.stream == stream) {
            res = ana;
            found = true;
          }
        });
        if(!found) {
          var analyser = context.createAnalyser();
          analyser.fftSize = 256;
          // var source = context.createMediaElementSource(elem);
          var source = context.createMediaStreamSource(stream);
          var mid = source.connect(analyser);
          if(!elem.fake_remote && !elem.preview) {
            mid.connect(context.destination);
          }
          var arr = new Uint8Array(analyser.frequencyBinCount);
          res = {
            stream: stream,
            user: user, 
            audio_element: elem,
            release: function() { 
              res.released = true;
              if(elem) {
                elem.srcObject = null;
              }
              if(context.state != 'closed') {
                context.close();
              }
            },
            analyser: analyser, 
            audio_track: track,
            bins: analyser.frequencyBinCount,
            frequency_array: arr
          };
          audio_analysers.push(res);
        }
  
        // analyser.connect(context.destination);
        if(!audio_loop.running) {
          audio_loop.running = true;
          audio_loop();
        }  
      }
    }
    return res;
  },
  enumerate: function(type) {
    return new Promise(function(res, rej) {
      var kind = (type == 'audio') ? /audioinput/ : /videoinput/;
      if(type == 'input') { kind = /input/; }
      if(!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return rej({error: 'not implemented'});
      }
      var result = [];
      var ids = {};
      navigator.mediaDevices.enumerateDevices().then(function(list) {
        list.forEach(function(dev) {
          if(!dev.groupId || dev.groupId == "") {
            dev.groupId = dev.deviceId;
          }
          if(dev.kind.match(kind) && !ids[dev.id]) {
            if(!result.find(function(d) { return d.label.replace(/Default - /, '') == dev.label && dev.groupId == d.groupId; })) {
              if(dev.kind == 'videoinput') {
                if(!dev.facingMode && dev.label.match(/facing front/i)) {
                  dev.facingMode = 'user';
                } else if(!dev.facingMode && dev.label.match(/front camera/i)) {
                  dev.facingMode = 'user';
                } else if(!dev.facingMode && dev.label.match(/back camera/i)) {
                  dev.facingMode = 'environment';
                } else if(!dev.facingMode && dev.label.match(/facing back/)) {
                  dev.facingMode = 'environment';
                }  
              }
              dev.type = dev.kind.replace(/input$/, '');
              result.push(dev);
            }
          }
        });
        res(result);
      }, function(err) { rej(err); });
    });
  }
}

var audio_loop = function() {
  audio_loop.iter = ((audio_loop.iter || 0) + 1) % 20;
  audio_loop.max = audio_loop.max || 0;
  if(audio_analysers.length > 0) {
    var biggest = null;
    audio_analysers.forEach(function(ana) {
      if(ana.released) { return; }
      ana.analyser.getByteFrequencyData(ana.frequency_array);
      var tally = 0;
      for(var i = 0; i < ana.bins; i++){
        tally = tally + ana.frequency_array[i];
      }
      if(audio_loop.verbose) {
        console.log(ana.audio_element, ana.frequency_array);
      }
      ana.output = (tally / ana.bins);
      if(ana.for_volume) {
        if(!biggest || ana.output > biggest.output) {
          biggest = ana;
        }  
      }
      if(ana.callback && isFinite(ana.output)) {
        ana.callback(ana.output);
      }
    });
    if(biggest != null && volume) {
      volume.style.width = (biggest.output || 0) + "px";
      if(preview_volume.offsetWidth > 0) {
        if(audio_loop.iter == 0) {
          var amt = Math.round(Math.min(audio_loop.max, 100));
          preview_volume.style.top = (-5 - amt) + 'px';
          preview_volume.style.left = preview_volume.style.top;
          preview_volume.style.right = preview_volume.style.top;
          preview_volume.style.bottom = preview_volume.style.top;
          preview_volume.style.borderWidth = amt + 'px';
          audio_loop.max = 0;
        } else {
          audio_loop.max = Math.max(audio_loop.max || 0, biggest.output);
        }  
      }
    }
    // set user as loudest, update display
  }
  window.requestAnimationFrame(audio_loop);
};

input.compat = {};
input.compat.system = "Desktop";
input.compat.browser = "Web browser";
input.compat.mobile = false;

if(navigator.userAgent.match(/ipod|ipad|iphone/i)) {
  input.compat.mobile = true;
  input.compat.system = "iOS";
  var userAgent = window.navigator.userAgent.toLowerCase();
  input.compat.webview = /iphone|ipod|ipad/.test( userAgent ) && !window.navigator.standalone && !/safari/.test( userAgent );

  var match = (navigator.appVersion || '').match(/OS (\d+)_(\d+)_?(\d+)?/), version, primary_version;
  if (match !== undefined && match !== null) {
      version = [
          parseInt(match[1], 10),
          parseInt(match[2], 10),
          parseInt(match[3] || 0, 10)
      ];
      input.compat.ios_version = version[0];
  }

  if(input.compat.installed_app) {
    input.compat.browser = "App";
  } else if(navigator.userAgent.match(/crios/i)) {
    input.compat.browser = "Chrome";
  } else if(navigator.userAgent.match(/safari/i)) {
    input.compat.browser = "Safari";
  }
  var version = navigator.userAgent.match(/OS\s+([\d_]+)\s+like/)[1];
  version = parseInt(version && version.split(/_/)[0], 10);
  if(version && isFinite(version)) {
    input.compat.system_version = version;
  }
} else if(navigator.userAgent.match(/android/i)) {
  input.compat.mobile = true;
  input.compat.system = "Android";
  input.compat.webview = navigator.userAgent.match(/Chrome\/.+Mobile/) && navigator.userAgent.match(/wv/);
  if(input.compat.installed_app) {
    input.compat.browser = "App";
    if(window.device && window.device.platform && window.device.platform.match(/fireos/i)) {
      input.compat.subsystem = "Kindle";
    }
  } else if(navigator.userAgent.match(/chrome/i)) {
    input.compat.browser = "Chrome";
  }
} else if(navigator.userAgent.match(/windows phone/i)) {
  input.compat.mobile = true;
  input.compat.system = "Windows Phone";
} else {
  if(navigator.userAgent.match(/macintosh/i)) {
    // srsly apple? If you're going to say iPadOS==MacOS
    // then at least give them the same bugs
    if(document.body.ontouchstart && navigator.maxTouchPoints > 2) {
      input.compat.system = "iPadOS";
      input.compat.mobile = true;
    } else {
      input.compat.system = "Mac";
    }
  } else if(navigator.userAgent.match(/windows\snt/i)) {
    input.compat.system = "Windows";
  }
  if(navigator.userAgent.match(/chrome/i)) {
    input.compat.browser = "Chrome";
  } else if(navigator.userAgent.match(/firefox/i)) {
    input.compat.browser = "Firefox";
  } else if(navigator.userAgent.match(/msie/i)) {
    input.compat.browser = "IE";
  } else if(navigator.userAgent.match(/edge/i)) {
    input.compat.browser = "Edge";
  } else if(navigator.userAgent.match(/safari/i)) {
    input.compat.browser = "Safari";
  }
}

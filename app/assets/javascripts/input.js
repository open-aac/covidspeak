var audio_analysers = [];
var volume = null;
var input = {
  track_audio: function(elem, track, user) {
    var res = null;
    if(!volume) {
      volume = document.querySelector('#volume_level');
      if(location.href.match(/localhost/)) {
        volume.style.display = 'block';
      } else {
        volume.style.display = 'none';
      }  
    }

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
              context.close(); 
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
      var kind = (type == 'audio') ? 'audioinput' : 'videoinput';
      if(!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        return rej({error: 'not implemented'});
      }
      var result = [];
      var ids = {};
      navigator.mediaDevices.enumerateDevices().then(function(list) {
        list.forEach(function(dev) {
          if(dev.kind == kind && !ids[dev.id]) {
            if(!result.find(function(d) { return d.label.replace(/Default - /, '') == dev.label && dev.groupId == d.groupId; })) {
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
    }
    // set user as loudest, update display
  }
  window.requestAnimationFrame(audio_loop);
};
// when a connection starts, assert it somewhere
// and don't allow responses
var remote = remote || {};
(function() {
  var log = function(verbose) {
    var opts = Array.from(arguments);
    if(verbose === true) {
      opts = opts.slice(1);
    }
    if(verbose === true && localStorage.verbose_logging != 'true') {
      return;
    }
    opts.unshift("RTC:");
    console.log.apply(null, opts);
  }
  var rooms = {};
  remote.webrtc2 = Object.assign(remote.webrtc2 || {}, {
    start_processsing: function(track, callback) {
      // This method will cause track_added to not be
      // triggered until the stream goes live, to help
      // prevent time with a black screen
      if(track.kind == 'video' || track.kind == 'audio') {
        var stream = new MediaStream();
        stream.addTrack(track);
        var elem = document.createElement(track.kind);
        elem.srcObject = stream;
        var loaded_meta = false;
        var do_it = function() {
          if(!loaded_meta) {
            loaded_meta = true;
            callback(remote.webrtc.dom_generator(track));
          }
        };
        elem.onloadedmetadata = do_it;
        setTimeout(do_it, 1000);
      } else {
        callback(null);
      }
    },
    dom_generator: function(track, stream) {
      stream = new MediaStream();
      stream.addTrack(track);  
      return function() {
        if(track.kind == 'audio' || track.kind == 'video') {
          var elem = document.createElement(track.kind);
          elem.srcObject = stream;
          elem.setAttribute('playsinline', true);
          elem.onloadedmetadata = function(e) {
            elem.play();
          };        
          return elem;
        }
        return null;
      };
    },
    track_ref: function(track, stream, id_index) {
      if(!track) { return null; }
      var device_id = track.name;
      if(track.getSettings) {
        device_id = track.getSettings().deviceId;
      }
      track.added_ts = track.added_ts || (new Date()).getTime()
      var ref = {
        type: track.kind,
        mediaStreamTrack: track,
        device_id: device_id,
        id: id_index + '-' + track.id,
        added: track.added_ts
      }
      if(track.kind == 'audio' || track.kind == 'video') {
        ref.generate_dom = remote.webrtc2.dom_generator(track, stream);
      }
      return ref;
    },
    start_local_tracks: function(opts) {
      return new Promise(function(res, rej) {
        input.request_media(opts).then(function(stream) {
          remote.webrtc2.local_tracks = stream.getTracks();
          remote.webrtc2.all_local_tracks = [].concat(remote.webrtc2.local_tracks);
          var result = [];
          remote.webrtc2.local_tracks.forEach(function(track) {
            track.live_content = true;
            result.push(remote.webrtc2.track_ref(track, stream, 0));
          });
          res(result);
        }, function(err) {
          rej(err);
        })
      });
    },
    add_local_tracks: function(room_id, stream_or_track) {
      var main_room = rooms[room_id];
      if(main_room) {
        return remote.webrtc2.tracks.add_tracks(main_room, stream_or_track);
      } else {
        return Promise.reject();
      }
    },
    replace_local_track: function(room_id, track) {
      // track.live_content || track.share_content
      var main_room = rooms[room_id];
      if(main_room) {
        return remote.webrtc2.tracks.replace_track(main_room, track);
      } else {
        return Promise.reject();
      }
    },
    remove_local_track: function(room_id, track_ref, remember) {
      var main_room = rooms[room_id];
      if(main_room) {
        return remote.webrtc2.tracks.remove_track(main_room, track_ref, remember);
      } else {
        return Promise.reject();
      }
    },
    refresh_remote_tracks: function(room_id, missing_type) {
      var main_room = rooms[room_id];
      if(main_room) {
        remote.webrtc2.tracks.refresh_tracks(main_room);
      }
    },
    connection_type: function(room_id, user_id) {
      var main_room = rooms[room_id];
      return remote.webrtc2.neg.connection_type(main_room, user_id);
    },
    reconnect: function() {
      if(rooms.latest) {
        var main_room = rooms.latest;
        for(var key in main_room.subrooms) {
          var sub = main_room.subrooms[key];
          remote.webrtc2.neg.renegotiate(sub, true);
        }
      }
    },
    send_message: function(room_id, message) {
      var main_room = rooms[room_id];
      if(main_room) {
        return remote.webrtc2.tracks.send_message(main_room, message);
      } else {
        return Promise.reject();
      }
    },
    connect_to_remote: function(access, room_key, update) {
      return new Promise(function(res, rej) {
        var main_room = remote.webrtc2.neg.enter_room(access, room_key, update);
        main_room.ref.defer = main_room.defer;
        rooms[room_key] = main_room;
        rooms.latest = main_room;
        remote.webrtc2.room = main_room;
        res(main_room.ref);
      });
    }
  });
  remote.webrtc2.rooms = rooms;
})();
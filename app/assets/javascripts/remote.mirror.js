var remote = remote || {};

remote.mirror = {
  rooms: {},
  start_processsing: function(track, fake_remote, callback) {
    if(track.kind == 'video' || track.kind == 'audio') {
      var stream = new MediaStream();
      stream.addTrack(track);
      var elem = document.createElement(track.kind);
      elem.srcObject = stream;
      elem.onloadedmetadata = function(e) {
        var generator = remote.mirror.dom_generator(track, null, fake_remote)
        callback(generator);
      }
    } else {
      callback(null);
    }
  },
  dom_generator: function(track, stream, fake_remote) {
    stream = new MediaStream();
    stream.addTrack(track);  
    return function() {
      if(track.kind == 'audio') {
        var elem = document.createElement('audio');
        elem.srcObject = stream;
        elem.onloadedmetadata = function(e) {
          elem.play();
        };  
        if(fake_remote) { 
          elem.muted = true;
          elem.fake_remote = true; 
        }      
        return elem;
      } else if(track.kind == 'video') {
        var elem = document.createElement('video');
        if(fake_remote) { 
          elem.fake_remote = true;
          elem.style.transform = "scaleX(-1)";
        }
        elem.srcObject = stream;
        elem.onloadedmetadata = function(e) {
           elem.play();
        };        
        return elem;
      }
      return null;
    };
  },
  start_local_tracks: function(opts) {
    return new Promise(function(res, rej) {
      input.request_media(opts).then(function(stream) {
        remote.mirror.local_tracks = stream.getTracks();
        var result = [];
        remote.mirror.local_tracks.forEach(function(track) {
          var track_ref = remote.mirror.track_ref(track, true, stream);
          track.initial_track = true;
          result.push(track_ref);
        });
        res(result);
      }, function(err) {
        rej(err);
      })
    });
  },
  add_local_tracks: function(room_id, stream_or_track) {
    var track_ref = stream_or_track;
    var main_room = remote.mirror.rooms[room_id];
    return new Promise(function(res, rej) {
      if(stream_or_track.getTracks) {
        var tracks = [];
        if(stream_or_track.getVideoTracks) {
          var vid = stream_or_track.getVideoTracks()[0];
          var aud = stream_or_track.getAudioTracks()[0];
          if(vid) { tracks.push(vid); }
          if(aud) { tracks.push(aud); }
        }
        if(tracks.length > 0) {
          var list = [];
          tracks.forEach(function(track) {
            var track_ref = remote.mirror.track_ref(track, true);
            list.push(track_ref);
            var new_track = false;
            if(remote.mirror.local_tracks.indexOf(track) == -1) {
              new_track = true;
              remote.mirror.local_tracks.push(track);
            }
            track.enabled = true;
            if(new_track) {
              setTimeout(function() {
                var track_ref = remote.mirror.track_ref(track, false);
                remote.mirror.start_processsing(track, true, function(generator) {
                  track_ref.generate_dom = generator;
                  remote.track_added(main_room.ref, main_room.remote_user_ref, track_ref);
                })
              }, 1000);
            }
          });
          res(list);
        } else {
          return rej({error: 'no track or connection found'});
        }
      } else {
        var track = (remote.mirror.local_tracks || []).find(function(t) { return ("0-" + t.id) == track_ref.id; });
        if(track_ref.device_id) {
          track = track || (remote.mirror.local_tracks || []).find(function(t) { return t.device_id == track_ref.device_id; });
        }
        if(track && pc) {
          track.enabled = true;
          res([track_ref]);
        } else {
          return rej({error: 'no track or connection found'});
        }
      }
    });
  },
  remove_local_track: function(room_id, track_ref, remember) {
    return new Promise(function(res, rej) {
      var track = (remote.mirror.local_tracks || []).find(function(t) { return ("0-" + t.id) == track_ref.id; });
      if(track_ref.device_id) {
        track = track || (remote.mirror.local_tracks || []).find(function(t) { return t.device_id == track_ref.device_id; });
      }
      var main_room = remote.mirror.rooms[room_id];

      if(track && main_room) {
        track.enabled = false;
        if(!remember) {
          setTimeout(function() {
            remote.track_removed(main_room.ref, main_room.remote_user_ref, {
              id: 'remote-' + track.id,
              type: track.kind
            });  
          }, 1000);
          track.stop();
          remote.mirror.local_tracks = (remote.mirror.local_tracks || []).filter(function(t) { return t.id != track_ref.id.replace(/^\d+-/, ''); });
        }
        res(track_ref);  
      } else {
        rej({error: 'failed to unpublish'});
      }
    })
  },
  reconnect: function() {
    // noop
  },
  track_ref: function(track, local, stream) {
    if(!track) { return null; }
    if(local) {
      track.local_added = track.local_added || (new Date()).getTime();
    } else {
      track.remote_added = track.remote_added || (new Date()).getTime();
    }
    var res = {
      id: (local ? '0-' : 'reverse-') + track.id,
      mediaStreamTrack: track,
      device_id: track.getSettings().deviceId,
      type: track.kind,
      added: (local ? track.local_added : track.remote_added),
    };
    if(track.kind == 'audio' || track.kind == 'video') {
      res.generate_dom = remote.mirror.dom_generator(track, stream);
    }
    return res;
  },
  connect_to_remote: function(access, room_key) {
    return new Promise(function(res, rej) {
      var main_room = remote.mirror.rooms[room_key] || {};
      
      remote.mirror.rooms = remote.mirror.rooms || {};
      remote.mirror.rooms[room_key] = main_room;

      var room_ref = {
        id: room_key
      }
      main_room.ref = room_ref;
      res(room_ref);
      setTimeout(function() {
        main_room.remote_user_ref = {
          id: 'mirror-self'
        };
        remote.user_added(main_room.ref, main_room.remote_user_ref);
        remote.mirror.local_tracks.forEach(function(track) {
          var track_ref = remote.mirror.track_ref(track, false);
          remote.mirror.start_processsing(track, true, function(generator) {
            track_ref.generate_dom = generator;
            remote.track_added(main_room.ref, main_room.remote_user_ref, track_ref);
          })
        });
      }, 2000);
      
    });
  },
  send_message: function(room_id, message) {
    // If 'update', add in the mids mapping
    // for camera, microphone, share_video, share_audio
    try {
      var json = JSON.parse(message);
      if(json && json.action == 'update') {
        json.tracks = {};
        // TODO: these need to be track_ref objects
        if(json.camera) {
          json.tracks.camera = remote.mirror.track_ref(remote.mirror.local_tracks.find(function(t) { return t.kind == 'video' && t.live_content && t.enabled && t.readyState == 'live'}));
        }
        if(json.microphone) {
          json.tracks.microphone = remote.mirror.track_ref(remote.mirror.local_tracks.find(function(t) { return t.kind == 'audio' && t.live_content && t.enabled && t.readyState == 'live'}));
        }
        if(json.sharing) {
          json.tracks.share_video = remote.mirror.track_ref(remote.mirror.local_tracks.find(function(t) { return t.kind == 'video' && t.share_content && t.enabled && t.readyState == 'live'}));
          json.tracks.share_audio = remote.mirror.track_ref(remote.mirror.local_tracks.find(function(t) { return t.kind == 'audio' && t.share_content && t.enabled && t.readyState == 'live'}));
        }
        var orig = message;
        message = json;
        // return new Promise(function(res, rej) {
        //   res({sent: orig});
        // });
      }
    } catch(e) { }
    var main_room = remote.mirror.rooms[room_id];
    return new Promise(function(res, rej) {
      if(main_room.remote_user_ref) {
        setTimeout(function() {
          if(json && json.action == 'update') {
            remote.message_received(main_room.ref, main_room.remote_user_ref, {id: 'remote-data'}, json);
          } else {
            remote.message_received(main_room.ref, main_room.remote_user_ref, {id: 'remote-data'}, message);
          }
          // If 'update', use the mid mappings to add in
          // camera_track, microphone_track, share_video_track and share_audio_track
        }, 100);
        res({sent: message});  
      } else {
        rej({error: 'user not yet wired up'});

      }
    });
  }
};

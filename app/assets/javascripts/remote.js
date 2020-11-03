// To add a new handler, you will need to implement
// a few methods as an object defined on the remote
// object (for example, remote.myvideo)
var remote = remote || {};
Object.assign(remote, {
  start_local_tracks: function(opts) {
    // Resolves a list of objects with the following attributes
    // { type: "video, audio, data", id: "", generate_dom: function...}
    return new Promise(function(res, rej) {
      remote[remote.backend].start_local_tracks(opts).then(function(tracks) {
        remote.default_local_tracks = tracks;
        remote.local_tracks = tracks;
        res(tracks);
      }, function(err) {
        rej(err);
      });
    });
  },
  local_track: function(type) {
    return (remote.default_local_tracks || []).find(function(t) { return t.type == type; });
  },
  add_local_tracks: function(room_id, stream_or_track_ref) {
    // Resolves with a list of track references
    return new Promise(function(res, rej) {
      remote[remote.backend].add_local_tracks(room_id, stream_or_track_ref).then(function(tracks) {
        var track_ids = tracks.map(function(t) { return t.id; });
        remote.removed_local_tracks = (remote.removed_local_tracks || []).filter(function(t) { return track_ids.indexOf(t.id) == -1;  });
        remote.local_tracks = (remote.local_tracks || []).concat(tracks);
        res(tracks);
      }, function(err) {
        rej(err);
      });    
    });
  },
  replace_local_track(room_id, track) {
    // Resolves with {added: track_ref, removed: track_ref_or_null}
    // (if you don't removed, we can handle that for you)
    // This should only be used for swapping default video
    // tracks, which should not require renegotiation. It makes
    // asssumptions about the type of track you are adding.
    var fallback = function() {
      return new Promise(function(res, rej) {
        var removed_track = null;
        var add_now = function() {
          var track_ref_or_stream = (remote.local_tracks || []).find(function(t) { return t.device_id == track.getSettings().deviceId; });
          if(!track_ref_or_stream) {
            console.log("no existing track found");
            var ms = new MediaStream();
            ms.addTrack(track);
            track_ref_or_stream = ms;
          }
          remote.add_local_tracks(room_id, track_ref_or_stream).then(function(tracks) {
            remote.default_local_tracks = (remote.default_local_tracks || []).filter(function(t) { return t.type != track.kind; });
            remote.default_local_tracks.push(tracks[0]);
            res({
              added: tracks[0],
              removed: removed_track
            });
          }, function(err) {
            rej(err);
          });
        };
        var current_default = (remote.default_local_tracks || []).find(function(t) { return t.type == track.kind; });
        if(current_default && current_default.mediaStreamTrack == track) { 
          console.error("already added local track", track)
          return res({added: current_default, removed: current_default});
        } else if(current_default) {
          removed_track = current_default;
          remote.remove_local_track(room_id, current_default).then(function(res) {
            add_now();
          }, function(err) {
            rej(err);
          });
        } else {
          add_now();
        }
      });
    };
    return new Promise(function(res, rej) {
      var existing_track = (remote.default_local_tracks || []).find(function(t) { return t.type == track.kind; });
      if(existing_track && existing_track.mediaStreamTrack == track) { 
        console.error("already added local track", track)
        res({
          added: existing_track,
          removed: existing_track
        });
      } else if(existing_track && remote[remote.backend].replace_local_track) {
        remote[remote.backend].replace_local_track(room_id, track).then(function(data) {
          remote.default_local_tracks = (remote.default_local_tracks || []).filter(function(t) { return t.type != track.kind; });
          remote.default_local_tracks.push(data.added);
          remote.local_tracks = (remote.local_tracks || []).filter(function(t) { return t.id != existing_track.id; });
          remote.local_tracks.push(data.added);
          data.removed = data.removed || existing_track;
          res(data);
        }, function(err) {
          console.error("could not replace local track, trying fallback", err);
          fallback().then(function(data) {
            res(data);
          }, function(err) {
            rej(err);s
          });
        });
      } else {
        if(!existing_track) {
          console.log("no local track to replace");
        } else {
          console.log("backend doesn't support replace, falling back");
        }
        fallback().then(function(data) {
          data.removed = data.removed || existing_track;
          res(data);
        }, function(err) {
          rej(err);
        });
      }
    });
  },
  remove_local_track: function(room_id, track, remember) {
    // Resolves with a track reference
    return new Promise(function(res, rej) {
      remote[remote.backend].remove_local_track(room_id, track, remember).then(function(track) {
        remote.default_local_tracks = (remote.default_local_tracks || []).filter(function(t) { return t.id != track.id; });
        var local = (remote.local_tracks || []).find(function(t) { return t.id == track.id; });
        if(local && remember) {
          remote.removed_local_tracks = (remote.removed_local_tracks || []).filter(function(t) { return t.id != track.id; });
          remote.removed_local_tracks.push(local);
        }
        remote.local_tracks = (remote.local_tracks || []).filter(function(t) { return t.id != track.id; });
        res(track);
      }, function(err) {
        rej(err);
      });
    });
  },
  refresh_remote_tracks: function(room_id, missing_type) {
    if(remote[remote.backend].refresh_remote_tracks) {
      remote[remote.backend].refresh_remote_tracks(room_id, missing_type);
    } else {
      console.log("BACKEND DOESN'T HANDLE REFRESHING REMOTE TRACKS");
    }
  },
  reconnect: function() {
    return remote[remote.backend].reconnect();
  },
  send_message: function(room_id, message) {
    // Resolves with the following attributes
    // { message: [Message Object] }
    var str = message;
    if(typeof(str) != 'string') { 
      str.timestamp = (new Date()).getTime();
      str = JSON.stringify(str); 
    }
    return remote[remote.backend].send_message(room_id, str);
  },
  connect_to_remote: function(access, room_key, update) {
    // Resolves an object with the following attributes
    // { id: "", 
    return new Promise(function(res, rej) {
      remote[remote.backend].connect_to_remote(access, room_key, update).then(function(room) {
        remote.rooms = remote.rooms || {};
        remote.rooms[room.id] = remote.rooms[room.id] || {};
        remote.rooms[room.id].room = room;
        if(room.defer) {
          room.defer.then(function() {
            res(room);
          }, function(err) {
            rej(err);
          });
        } else {
          res(room);
        }
      }, function(err) {
        rej(err);
      });

    })
  },
  connection_type: function(room_id, user_id) {
    if(remote[remote.backend].connection_type) {
      return remote[remote.backend].connection_type(room_id, user_id);
    } else {
      return new Promise(function(res, rej) {
        rej('unknown');
      })
    }
  },
  user_added: function(room, user, notify) {
    remote.rooms[room.id].users = remote.rooms[room.id].users || {}
    remote.rooms[room.id].users[user.id] = remote.rooms[room.id].users[user.id] || {};
    if(notify === false && (!remote.rooms[room.id].users[user.id].user || remote.rooms[room.id].users[user.id].user.placeholder)) {
      user.placeholder = true;
    }
    remote.rooms[room.id].users[user.id].user = user;
    // Trigger for each user that joins, or for each
    // user that is already in the session
    if(notify !== false) {
      delete user.placeholder;
      remote.empty = false;
      remote.notify('user_added', {
        user: user,
        room: remote.rooms[room.id].room,
        room_id: room.id
      });  
    }
  },
  user_removed: function(room, user) {
    remote.rooms[room.id].users = remote.rooms[room.id].users || {}
    remote.rooms[room.id].users[user.id] = remote.rooms[room.id].users[user.id] || {};
    remote.rooms[room.id].users[user.id].user = user;
    remote.rooms[room.id].users[user.id].user.removed = true;
    remote.notify('user_removed', {
      user: user,
      room: remote.rooms[room.id].room,
      room_id: room.id
    });
    var someone_still_here = false;
    for(var user_id in remote.rooms[room.id].users) {
      if(window.room.current_room && user_id == window.room.current_room.user_id) {
      } else {
        if(!remote.rooms[room.id].users[user_id].user.removed && !remote.rooms[room.id].users[user_id].user.placeholder) {
          someone_still_here = true;
        }
      }
    }
    if(!someone_still_here) {
      remote.empty = true;
      remote.notify('room_empty', {
        room: remote.rooms[room.id].room,
        room_id: room.id
      });
    }
  },
  connection_error: function(room, user, state) {
    remote.notify('connection_error', {
      room: room,
      user: user,
      state: state,
      user_id: user.id,
      room_id: room.id
    });
  },
  track_added: function(room, user, track) {
    track.added_at = (new Date()).getTime();
    remote.rooms[room.id].users[user.id].tracks = remote.rooms[room.id].users[user.id].tracks || {};
    var user = remote.rooms[room.id].users[user.id].user;
    if(track.type == 'video') {
      for(var track_id in remote.rooms[room.id].users[user.id].tracks) {
        var t = remote.rooms[room.id].users[user.id].tracks[track_id];
        if(t.type == 'video' && t.mediaStreamTrack && t.mediaStreamTrack.readyState == 'live' && !t.mediaStreamTrack.muted && t.mediaStreamTrack.enabled) {
          track.possibly_secondary = true;
        }
      }
    }
    remote.rooms[room.id].users[user.id].tracks[track.id] = track;
    // Trigger for each track that is added for a remote user
    remote.notify('track_added', {
      track: track,
      user: user,
      room: remote.rooms[room.id].room,
      room_id: room.id,
      user_id: user.id
    });
  },
  track_removed: function(room, user, track) {
    remote.rooms[room.id].users[user.id].tracks = remote.rooms[room.id].users[user.id].tracks || {};
    delete remote.rooms[room.id].users[user.id].tracks[track.id];
    var tracks = remote.rooms[room.id].users[user.id].tracks || {};
    var newest = null;
    for(var key in tracks) {
      if(tracks[key].type == track.type) {
        if(!newest || tracks[key].added_at > newest.added_at) {
          newest = tracks[key];
        }
      }
    }
    // Trigger for each track that is added for a remote user
    remote.notify('track_removed', {
      track: track,
      newest_other: newest,
      user: remote.rooms[room.id].users[user.id].user,
      room: remote.rooms[room.id].room,
      room_id: room.id,
      user_id: user.id
    });

  },
  message_received: function(room, user, track, message) {
    // Trigger for each data track message receiveds
    var json = message;
    var user = remote.rooms[room.id].users[user.id].user;
    try {
      if(typeof(message) == 'string') { 
        json = JSON.parse(json);
      }
      if(json.timestamp && remote.rooms[room.id] && remote.rooms[room.id].users[user.id]) {
        var now = (new Date()).getTime();
        user.ts_offset = (json.timestamp - now);
        remote.rooms[room.id].users[user.id].ts_offset = (json.timestamp - now);
      }
    } catch(e) { }
  
    // TODO: track how recently a user a sent a message,
    // If they appear active (no connection in progress)
    // but haven't sent a message for 2 minutes,
    // mark them as left and trigger notifications
    // TODO: add .disconnect to manually shut off a room?
    if(!remote.rooms[room.id].users[user.id].tracks) {
      remote.track_added(room, user, track);
    }
    remote.notify('message', {
      message: json,
      room: remote.rooms[room.id].room,
      user: user,
      track: remote.rooms[room.id].users[user.id].tracks[track.id],
      room_id: room.id,
      track_id: track.id,
      user_id: user.id
    });
  },
  // Helper methods that you can ignore
  notify: function(message_type, payload) {
    var listeners = (remote.listeners || {})[message_type] || [];
    listeners.forEach(function(listener) {
      listener(payload);
    })
  },
  handle_listener: function(message_type, callback, add) {
    var listeners = (remote.listeners || {})[message_type] || [];
    listeners.forEach(function(listener) {
      listener(payload);
    })
    listeners = listeners.filter(function(l) { return l != callback; });
    if(add) {
      listeners.push(callback);
    }
    remote.listeners = remote.listeners || {};
    remote.listeners[message_type] = listeners;
  },
  addEventListener: function(message_type, callback) {
    remote.handle_listener(message_type, callback, true);
  },
  removeEventListener: function(messsage_type, callback) {
    remote.handle_listener(message_type, callback, false);
  },
  join_room: function(room_id) {
    var user_id = room.current_user_id;
    var room_ref = {
      id: room_id,
      user_id: user_id,
      send: function(message) {
        message.webrtc = true;
        session.send_to_room(room_id, message);
      },
      subroom_id: function(remote_user_id) {
        if(room_ref.raw_users) {
          var me = room_ref.raw_users.find(function(u) { return u.id == room_ref.user_id; });
          var them = room_ref.raw_users.find(function(u) { return u.id == remote_user_id; });
          if(room_ref.raw_users.indexOf(me) != -1 && room_ref.raw_users.indexOf(them) != -1) {
            if(room_ref.raw_users.indexOf(me) < room_ref.raw_users.indexOf(them)) {
              return room_id + "::" + me.id + "::" + them.id;
            } else {
              return room_id + "::" + them.id + "::" + me.id;
            }
          } else {
            console.error("USERS AREN'T IN LIST before calling subroom_id");
          }
        } else {
          console.error("NO USERS DEFINED before calling subroom_id");
          return null;
        }
      }
    };
    session.join_room({room_id: room_id, user_id: user_id}, function(data) {
      if(room_ref.onmessage) {
        room_ref.onmessage(data);
      }
      // console.log("ROOM DATA", data);
    }).then(null, function(err) {
      console.log("ROOM SOCKET ENTRY FAILED", err);
    });
    return room_ref;
  }
});
